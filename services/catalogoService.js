const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { obterTokens } = require("../config/tokenStore");

const CATEGORIAS = [
  {
    categoria: "Organização",
    termos: ["organizador gaveta", "organizador geladeira", "sapateira organizadora", "caixa organizadora"]
  },
  {
    categoria: "Cozinha",
    termos: ["potes hermeticos cozinha", "porta temperos cozinha", "escorredor louca", "cortador legumes"]
  },
  {
    categoria: "Limpeza",
    termos: ["mop limpeza", "escova eletrica limpeza", "aspirador vertical casa", "limpa vidros"]
  },
  {
    categoria: "Banheiro",
    termos: ["prateleira banheiro", "organizador box banheiro", "porta escovas banheiro", "dispenser sabonete banheiro"]
  },
  {
    categoria: "Decoração",
    termos: ["espelho decorativo casa", "vaso decorativo casa", "almofada decorativa", "quadro decorativo casa"]
  },
  {
    categoria: "Quarto",
    termos: ["jogo de cama", "cabide veludo", "organizador roupas", "cortina blackout"]
  },
  {
    categoria: "Lavanderia",
    termos: ["varal retratil", "cesto roupa suja", "organizador lavanderia", "saco organizador vacuo"]
  },
  {
    categoria: "Iluminação",
    termos: ["luz sensor movimento", "fita led casa", "luminaria sem fio", "abajur decorativo"]
  },
  {
    categoria: "Utilidades",
    termos: ["seladora alimentos", "balanca digital cozinha", "umidificador aromatizador", "dispenser automatico"]
  },
  {
    categoria: "Jardim",
    termos: ["vaso plantas decorativo", "kit jardinagem", "mangueira expansivel", "regador plantas"]
  }
];

const TERMOS_RUIDO = [
  "fantasia", "camiseta", "camisa", "adesivo automotivo", "carro", "moto",
  "festa infantil", "painel festa", "topo de bolo", "lembrancinha"
];

function headers() {
  const tokens = obterTokens();

  if (!tokens?.access_token) {
    throw new Error("Mercado Livre não está conectado.");
  }

  return {
    Authorization: `Bearer ${tokens.access_token}`
  };
}

function marca(produto) {
  return produto.attributes?.find(a => a.id === "BRAND")?.value_name || null;
}

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function temRuido(produto) {
  const nome = normalizar(produto.name);
  return TERMOS_RUIDO.some(termo => nome.includes(normalizar(termo)));
}

function pontuar(produto, termo) {
  let score = 0;
  const nome = normalizar(produto.name);
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);

  palavras.forEach(palavra => {
    if (palavra.length > 3 && nome.includes(palavra)) score += 2;
  });

  if (marca(produto)) score += 2;
  if ((produto.pictures || []).length >= 3) score += 2;
  if ((produto.pictures || []).length >= 5) score += 1;
  if (produto.quality_type === "COMPLETE") score += 2;
  if (produto.short_description?.content) score += 1;
  if (produto.product_standard) score += 1;

  return score;
}

function formatar(produto, categoria, termo) {
  return {
    id: produto.id,
    nome: produto.name,
    marca: marca(produto),
    imagem: produto.pictures?.[0]?.url || null,
    imagens: (produto.pictures || []).map(img => img.url),
    categoria,
    marketplace: "Mercado Livre",
    affiliateUrl: null,
    catalogUrl: `https://www.mercadolivre.com.br/p/${produto.id}`,
    dominio: produto.domain_id || null,
    score: pontuar(produto, termo)
  };
}

async function pesquisarTermo(termo) {
  const response = await axios.get(
    "https://api.mercadolibre.com/products/search",
    {
      params: {
        status: "active",
        site_id: "MLB",
        q: termo
      },
      headers: headers(),
      timeout: 15000
    }
  );

  return response.data.results || [];
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          erro: error.response?.data || error.message
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function gerarCatalogo200() {
  const buscas = CATEGORIAS.flatMap(config =>
    config.termos.map(termo => ({
      categoria: config.categoria,
      termo
    }))
  );

  const respostas = await mapLimit(buscas, 5, async busca => {
    const resultados = await pesquisarTermo(busca.termo);
    return {
      ...busca,
      resultados
    };
  });

  const idsGlobais = new Set();
  const produtosFinais = [];

  for (const config of CATEGORIAS) {
    const candidatos = [];

    respostas
      .filter(resposta => resposta?.categoria === config.categoria && Array.isArray(resposta.resultados))
      .forEach(resposta => {
        resposta.resultados.forEach(produto => {
          if (!produto?.id || !produto?.name || !produto?.pictures?.length) return;
          if (produto.status !== "active") return;
          if (temRuido(produto)) return;

          candidatos.push(formatar(produto, config.categoria, resposta.termo));
        });
      });

    const locais = new Set();
    const unicos = candidatos
      .filter(produto => {
        if (locais.has(produto.id) || idsGlobais.has(produto.id)) return false;
        locais.add(produto.id);
        return true;
      })
      .sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 20);

    unicos.forEach(produto => idsGlobais.add(produto.id));
    produtosFinais.push(...unicos);
  }

  if (produtosFinais.length < 180) {
    throw new Error(`Catálogo gerado com poucos produtos (${produtosFinais.length}). Tente novamente.`);
  }

  const payload = {
    projeto: "Casa no Capricho",
    marketplace: "Mercado Livre",
    geradoEm: new Date().toISOString(),
    criterio: "relevancia, completude do catalogo, imagens e aderencia ao nicho",
    quantidade: produtosFinais.length,
    categorias: Object.fromEntries(
      CATEGORIAS.map(categoria => [
        categoria.categoria,
        produtosFinais.filter(p => p.categoria === categoria.categoria).length
      ])
    ),
    produtos: produtosFinais
  };

  const destino = path.join(__dirname, "..", "public", "data", "products.json");
  const temporario = destino + ".tmp";

  await fs.writeFile(temporario, JSON.stringify(payload), "utf8");
  await fs.rename(temporario, destino);

  return payload;
}

module.exports = {
  CATEGORIAS,
  pesquisarTermo,
  gerarCatalogo200
};

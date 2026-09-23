const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { obterTokens } = require("../config/tokenStore");

const CATEGORIAS = [
  {
    categoria: "Organização",
    termos: ["organizador gaveta", "organizador geladeira", "sapateira organizadora", "caixa organizadora", "organizador armario", "organizador cozinha"]
  },
  {
    categoria: "Cozinha",
    termos: ["potes hermeticos cozinha", "porta temperos cozinha", "escorredor louca", "cortador legumes", "utensilios cozinha", "organizador cozinha"]
  },
  {
    categoria: "Limpeza",
    termos: ["mop limpeza", "escova eletrica limpeza", "aspirador vertical casa", "limpa vidros", "rodo limpeza", "kit limpeza casa"]
  },
  {
    categoria: "Banheiro",
    termos: ["prateleira banheiro", "organizador box banheiro", "porta escovas banheiro", "dispenser sabonete banheiro", "armario banheiro", "suporte banheiro"]
  },
  {
    categoria: "Decoração",
    termos: ["espelho decorativo casa", "vaso decorativo casa", "almofada decorativa", "quadro decorativo casa", "tapete decorativo", "decoracao sala"]
  },
  {
    categoria: "Quarto",
    termos: ["jogo de cama", "cabide veludo", "organizador roupas", "cortina blackout", "roupa de cama", "organizador guarda roupa"]
  },
  {
    categoria: "Lavanderia",
    termos: ["varal retratil", "cesto roupa suja", "organizador lavanderia", "saco organizador vacuo", "prateleira lavanderia", "cesto lavanderia"]
  },
  {
    categoria: "Iluminação",
    termos: ["luz sensor movimento", "fita led casa", "luminaria sem fio", "abajur decorativo", "luminaria led", "luz noturna"]
  },
  {
    categoria: "Utilidades",
    termos: ["seladora alimentos", "balanca digital cozinha", "umidificador aromatizador", "dispenser automatico", "mini ventilador", "organizador multiuso"]
  },
  {
    categoria: "Jardim",
    termos: ["vaso plantas decorativo", "kit jardinagem", "mangueira expansivel", "regador plantas", "suporte plantas", "jardim vertical"]
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

function pontuar(produto, termo, detalhe) {
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
  if (detalhe?.buy_box_winner?.item_id) score += 5;
  if ((detalhe?.buy_box_winner?.available_quantity || 0) > 0) score += 2;

  return score;
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

async function detalheProduto(id) {
  const response = await axios.get(
    `https://api.mercadolibre.com/products/${id}`,
    {
      headers: headers(),
      timeout: 15000
    }
  );

  return response.data;
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
        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => next())
  );

  return results;
}

async function enriquecer(produto) {
  const detalhe = await detalheProduto(produto.id);
  const vencedor = detalhe?.buy_box_winner;

  // Para afiliados, evitamos páginas de catálogo sem uma oferta comprável.
  if (!detalhe?.permalink) return null;
  if (detalhe.status !== "active") return null;
  if (!vencedor?.item_id) return null;
  if ((vencedor.available_quantity ?? 1) <= 0) return null;

  return {
    ...produto,
    detalhe
  };
}

function formatar(produto, categoria, termo, detalhe) {
  const vencedor = detalhe.buy_box_winner;

  return {
    id: produto.id,
    itemId: vencedor.item_id,
    nome: detalhe.name || produto.name,
    marca: marca(produto),
    imagem: detalhe.pictures?.[0]?.url || produto.pictures?.[0]?.url || null,
    imagens: (detalhe.pictures || produto.pictures || []).map(img => img.url),
    categoria,
    marketplace: "Mercado Livre",
    affiliateUrl: null,
    catalogUrl: detalhe.permalink,
    preco: vencedor.price ?? null,
    moeda: vencedor.currency_id || "BRL",
    dominio: detalhe.domain_id || produto.domain_id || null,
    score: pontuar(produto, termo, detalhe)
  };
}

async function gerarCatalogo200() {
  const buscas = CATEGORIAS.flatMap(config =>
    config.termos.map(termo => ({
      categoria: config.categoria,
      termo
    }))
  );

  const respostas = await mapLimit(buscas, 6, async busca => {
    const resultados = await pesquisarTermo(busca.termo);
    return {
      ...busca,
      resultados
    };
  });

  const candidatosBase = [];
  const vistosBase = new Set();

  respostas
    .filter(Boolean)
    .forEach(resposta => {
      (resposta.resultados || []).forEach(produto => {
        if (!produto?.id || !produto?.name || !produto?.pictures?.length) return;
        if (produto.status !== "active") return;
        if (temRuido(produto)) return;

        const chave = resposta.categoria + ":" + produto.id;
        if (vistosBase.has(chave)) return;
        vistosBase.add(chave);

        candidatosBase.push({
          produto,
          categoria: resposta.categoria,
          termo: resposta.termo
        });
      });
    });

  const enriquecidos = await mapLimit(candidatosBase, 8, async candidato => {
    const info = await enriquecer(candidato.produto);
    if (!info) return null;

    return {
      produto: info,
      categoria: candidato.categoria,
      termo: candidato.termo
    };
  });

  const idsGlobais = new Set();
  const produtosFinais = [];

  for (const config of CATEGORIAS) {
    const locais = new Set();

    const candidatos = enriquecidos
      .filter(Boolean)
      .filter(candidato => candidato.categoria === config.categoria)
      .map(candidato =>
        formatar(
          candidato.produto,
          candidato.categoria,
          candidato.termo,
          candidato.produto.detalhe
        )
      )
      .filter(produto => {
        if (locais.has(produto.id) || idsGlobais.has(produto.id)) return false;
        locais.add(produto.id);
        return true;
      })
      .sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 20);

    candidatos.forEach(produto => idsGlobais.add(produto.id));
    produtosFinais.push(...candidatos);
  }

  if (produtosFinais.length < 150) {
    throw new Error(
      `Poucos produtos elegíveis para links foram encontrados (${produtosFinais.length}). Tente novamente mais tarde.`
    );
  }

  const payload = {
    projeto: "Casa no Capricho",
    marketplace: "Mercado Livre",
    geradoEm: new Date().toISOString(),
    criterio: "produto ativo com oferta compravel, URL canonica, relevancia, imagens e aderencia ao nicho",
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
  detalheProduto,
  gerarCatalogo200
};

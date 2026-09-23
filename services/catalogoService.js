const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { obterTokens } = require("../config/tokenStore");

const CATEGORIAS = [
  { categoria: "Organização", termos: ["organizador gaveta", "organizador geladeira", "sapateira organizadora", "caixa organizadora", "organizador armario", "organizador cozinha"] },
  { categoria: "Cozinha", termos: ["potes hermeticos cozinha", "porta temperos cozinha", "escorredor louca", "cortador legumes", "utensilios cozinha", "organizador cozinha"] },
  { categoria: "Limpeza", termos: ["mop limpeza", "escova eletrica limpeza", "aspirador vertical casa", "limpa vidros", "rodo limpeza", "kit limpeza casa"] },
  { categoria: "Banheiro", termos: ["prateleira banheiro", "organizador box banheiro", "porta escovas banheiro", "dispenser sabonete banheiro", "armario banheiro", "suporte banheiro"] },
  { categoria: "Decoração", termos: ["espelho decorativo casa", "vaso decorativo casa", "almofada decorativa", "quadro decorativo casa", "tapete decorativo", "decoracao sala"] },
  { categoria: "Quarto", termos: ["jogo de cama", "cabide veludo", "organizador roupas", "cortina blackout", "roupa de cama", "organizador guarda roupa"] },
  { categoria: "Lavanderia", termos: ["varal retratil", "cesto roupa suja", "organizador lavanderia", "saco organizador vacuo", "prateleira lavanderia", "cesto lavanderia"] },
  { categoria: "Iluminação", termos: ["luz sensor movimento", "fita led casa", "luminaria sem fio", "abajur decorativo", "luminaria led", "luz noturna"] },
  { categoria: "Utilidades", termos: ["seladora alimentos", "balanca digital cozinha", "umidificador aromatizador", "dispenser automatico", "mini ventilador", "organizador multiuso"] },
  { categoria: "Jardim", termos: ["vaso plantas decorativo", "kit jardinagem", "mangueira expansivel", "regador plantas", "suporte plantas", "jardim vertical"] }
];

const TERMOS_RUIDO = [
  "fantasia", "camiseta", "camisa", "adesivo automotivo", "carro", "moto",
  "festa infantil", "painel festa", "topo de bolo", "lembrancinha"
];

function headers() {
  const tokens = obterTokens();
  if (!tokens?.access_token) throw new Error("Mercado Livre não está conectado.");
  return { Authorization: `Bearer ${tokens.access_token}` };
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

function slug(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
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
  if (produto.quality_type === "COMPLETE") score += 3;
  if (produto.short_description?.content) score += 1;
  if (produto.product_standard) score += 1;
  if (!produto.children_ids?.length) score += 2;

  return score;
}

function urlFallback(produto) {
  const nome = slug(produto.name);
  return `https://www.mercadolivre.com.br/${nome}/p/${produto.id}`;
}

async function pesquisarTermo(termo) {
  const response = await axios.get(
    "https://api.mercadolibre.com/products/search",
    {
      params: { status: "active", site_id: "MLB", q: termo },
      headers: headers(),
      timeout: 15000
    }
  );
  return response.data.results || [];
}

async function detalheProdutoSeguro(id) {
  try {
    const response = await axios.get(
      `https://api.mercadolibre.com/products/${id}`,
      { headers: headers(), timeout: 12000 }
    );
    return response.data || null;
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

function formatar(produto, categoria, termo, detalhe) {
  const permalink = detalhe?.permalink || urlFallback(produto);
  const vencedor = detalhe?.buy_box_winner || null;

  return {
    id: produto.id,
    itemId: vencedor?.item_id || null,
    nome: detalhe?.name || produto.name,
    marca: marca(produto),
    imagem: detalhe?.pictures?.[0]?.url || produto.pictures?.[0]?.url || null,
    imagens: (detalhe?.pictures || produto.pictures || []).map(img => img.url),
    categoria,
    marketplace: "Mercado Livre",
    affiliateUrl: null,
    catalogUrl: permalink,
    urlVerificada: Boolean(detalhe?.permalink),
    preco: vencedor?.price ?? null,
    moeda: vencedor?.currency_id || "BRL",
    dominio: detalhe?.domain_id || produto.domain_id || null,
    score: pontuar(produto, termo)
  };
}

async function gerarCatalogo200() {
  const buscas = CATEGORIAS.flatMap(config =>
    config.termos.map(termo => ({ categoria: config.categoria, termo }))
  );

  const respostas = await mapLimit(buscas, 6, async busca => ({
    ...busca,
    resultados: await pesquisarTermo(busca.termo)
  }));

  const idsGlobais = new Set();
  const produtosFinais = [];

  for (const config of CATEGORIAS) {
    const candidatos = [];
    const vistos = new Set();

    respostas
      .filter(r => r && r.categoria === config.categoria && Array.isArray(r.resultados))
      .forEach(resposta => {
        resposta.resultados.forEach(produto => {
          if (!produto?.id || !produto?.name || !produto?.pictures?.length) return;
          if (produto.status !== "active") return;
          if (temRuido(produto)) return;
          if (produto.children_ids?.length) return;
          if (vistos.has(produto.id) || idsGlobais.has(produto.id)) return;

          vistos.add(produto.id);
          candidatos.push({ produto, termo: resposta.termo });
        });
      });

    candidatos.sort(
      (a, b) =>
        pontuar(b.produto, b.termo) - pontuar(a.produto, a.termo) ||
        a.produto.name.localeCompare(b.produto.name, "pt-BR")
    );

    // Consultamos detalhes apenas dos melhores candidatos. Se a aplicação não
    // tiver acesso a /products/{id}, usamos a URL canônica derivada do produto.
    const preSelecionados = candidatos.slice(0, 28);
    const detalhes = await mapLimit(preSelecionados, 5, async c => detalheProdutoSeguro(c.produto.id));

    const selecionados = preSelecionados
      .map((c, i) => formatar(c.produto, config.categoria, c.termo, detalhes[i]))
      .slice(0, 20);

    selecionados.forEach(p => idsGlobais.add(p.id));
    produtosFinais.push(...selecionados);
  }

  if (produtosFinais.length < 150) {
    throw new Error(`Catálogo gerado com poucos produtos (${produtosFinais.length}). Tente novamente.`);
  }

  const payload = {
    projeto: "Casa no Capricho",
    marketplace: "Mercado Livre",
    geradoEm: new Date().toISOString(),
    criterio: "produto ativo, terminal, relevante, com imagens e aderente ao nicho",
    quantidade: produtosFinais.length,
    urlsVerificadas: produtosFinais.filter(p => p.urlVerificada).length,
    categorias: Object.fromEntries(
      CATEGORIAS.map(c => [
        c.categoria,
        produtosFinais.filter(p => p.categoria === c.categoria).length
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

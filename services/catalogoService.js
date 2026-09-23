const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { obterTokens } = require("../config/tokenStore");

const REVIEW_PATH = path.join(__dirname, "..", "data", "affiliate-review.json");
const CATALOG_PATH = path.join(__dirname, "..", "public", "data", "products.json");

const TARGET_TOTAL = 211;
const SOFT_CATEGORY_CAP = 36;

const CATEGORIAS = [
  { categoria: "Organização", termos: ["organizador gaveta", "organizador geladeira", "sapateira organizadora", "caixa organizadora", "organizador armario", "organizador cozinha", "cesto organizador", "prateleira organizadora", "colmeia organizadora", "organizador banheiro", "organizador despensa", "organizador acrilico"] },
  { categoria: "Cozinha", termos: ["potes hermeticos cozinha", "porta temperos cozinha", "escorredor louca", "cortador legumes", "utensilios cozinha", "organizador cozinha", "escorredor talheres", "porta mantimentos", "tabua cozinha", "porta utensilios cozinha", "kit potes cozinha", "dispenser cereais", "colher de pau", "colher madeira cozinha", "talheres silicone", "kit utensilios silicone", "jogo de panelas", "panela antiaderente", "panela pressao", "panela de pressao", "panela pressao eletrica", "porta pratos", "escorredor pratos", "passa pratos"] },
  { categoria: "Limpeza", termos: ["mop limpeza", "escova eletrica limpeza", "aspirador vertical casa", "limpa vidros", "rodo limpeza", "kit limpeza casa", "esfregao limpeza", "pano microfibra", "vassoura limpeza", "escova limpeza casa", "balde limpeza", "organizador produtos limpeza"] },
  { categoria: "Banheiro", termos: ["prateleira banheiro", "organizador box banheiro", "porta escovas banheiro", "dispenser sabonete banheiro", "armario banheiro", "suporte banheiro", "porta toalha banheiro", "nicho banheiro", "kit banheiro", "tapete banheiro", "porta shampoo banheiro", "lixeira banheiro"] },
  { categoria: "Decoração", termos: ["espelho decorativo casa", "vaso decorativo casa", "almofada decorativa", "quadro decorativo casa", "tapete decorativo", "decoracao sala", "nicho decorativo", "centro mesa decorativo", "bandeja decorativa", "porta retrato decorativo", "manta sofa", "enfeite sala"] },
  { categoria: "Quarto", termos: ["jogo de cama", "cabide veludo", "organizador roupas", "cortina blackout", "roupa de cama", "organizador guarda roupa", "caixa organizadora quarto", "colmeia organizadora", "capa travesseiro", "protetor colchao", "sapateira quarto", "cabide organizador"] },
  { categoria: "Lavanderia", termos: ["varal retratil", "cesto roupa suja", "organizador lavanderia", "saco organizador vacuo", "prateleira lavanderia", "cesto lavanderia", "armario lavanderia", "varal parede", "prendedor roupa", "capa maquina lavar", "saco lavar roupa", "cabide lavanderia"] },
  { categoria: "Iluminação", termos: ["luz sensor movimento", "fita led casa", "luminaria sem fio", "abajur decorativo", "luminaria led", "luz noturna", "luminaria mesa", "spot led", "plafon led casa", "luminaria cozinha", "luminaria quarto", "luminaria parede"] },
  { categoria: "Utilidades", termos: ["seladora alimentos", "balanca digital cozinha", "umidificador aromatizador", "dispenser automatico", "mini ventilador", "organizador multiuso", "suporte multiuso", "dispenser cozinha", "abridor multiuso", "suporte papel toalha", "porta sacolas", "dispenser detergente"] },
  { categoria: "Jardim", termos: ["vaso plantas decorativo", "kit jardinagem", "mangueira expansivel", "regador plantas", "suporte plantas", "jardim vertical", "vaso autoirrigavel", "ferramentas jardinagem", "tesoura poda", "pa jardinagem", "suporte vaso plantas", "pulverizador plantas"] },
  { categoria: "Móveis", termos: ["roupeiro", "guarda roupa", "mesa jantar", "mesa cozinha", "mesa dobravel", "mesa auxiliar", "balcao passa pratos", "passa pratos cozinha"] }
];

const EXPANSAO_PRIORITARIA = [
  { categoria: "Cozinha", termo: "colher de pau" },
  { categoria: "Cozinha", termo: "colher madeira cozinha" },
  { categoria: "Cozinha", termo: "talheres silicone" },
  { categoria: "Cozinha", termo: "kit utensilios silicone" },
  { categoria: "Cozinha", termo: "jogo de panelas" },
  { categoria: "Cozinha", termo: "panela antiaderente" },
  { categoria: "Cozinha", termo: "panela de pressao" },
  { categoria: "Cozinha", termo: "panela pressao eletrica" },
  { categoria: "Cozinha", termo: "porta pratos" },
  { categoria: "Cozinha", termo: "escorredor pratos" },
  { categoria: "Móveis", termo: "roupeiro" },
  { categoria: "Móveis", termo: "guarda roupa" },
  { categoria: "Móveis", termo: "mesa jantar" },
  { categoria: "Móveis", termo: "mesa cozinha" },
  { categoria: "Móveis", termo: "mesa dobravel" },
  { categoria: "Móveis", termo: "mesa auxiliar" },
  { categoria: "Móveis", termo: "balcao passa pratos" }
];

const TERMOS_RUIDO = [
  "fantasia", "camiseta", "camisa", "adesivo automotivo", "automotiva", "carro", "moto",
  "festa infantil", "painel festa", "topo de bolo", "lembrancinha", "brinquedo", "drone",
  "espada ninja", "samurai", "mamadeira", "moving spot", "empilhadeira", "puzzle",
  "kit jardinagem infantil", "shampoo para veiculo"
];

function headers() {
  const tokens = obterTokens();
  if (!tokens?.access_token) throw new Error("Mercado Livre não está conectado.");
  return { Authorization: `Bearer ${tokens.access_token}` };
}

async function carregarJsonSeguro(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function carregarRevisao() {
  const data = await carregarJsonSeguro(REVIEW_PATH, {});
  return {
    aprovados: data.aprovados || {},
    rejeitados: new Set(data.rejeitados || [])
  };
}

async function carregarCatalogoAtual() {
  const data = await carregarJsonSeguro(CATALOG_PATH, {});
  return Array.isArray(data.produtos) ? data.produtos : [];
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

function palavrasRelevantes(termo) {
  const ignorar = new Set(["para", "com", "sem", "kit", "jogo", "cozinha", "casa"]);
  return normalizar(termo)
    .split(/\s+/)
    .filter(p => p.length >= 4 && !ignorar.has(p));
}

function aderenteAoTermo(produto, termo) {
  const nome = normalizar(produto?.name);
  const palavras = palavrasRelevantes(termo);
  if (!palavras.length) return true;
  return palavras.some(p => nome.includes(p));
}

function temRuido(produto) {
  const nome = normalizar(produto.name);
  return TERMOS_RUIDO.some(termo => nome.includes(normalizar(termo)));
}

function pontuar(produto, termo) {
  let score = 0;
  const nome = normalizar(produto.name);
  const palavras = palavrasRelevantes(termo);

  palavras.forEach(palavra => {
    if (nome.includes(palavra)) score += 4;
  });

  if (marca(produto)) score += 3;
  if ((produto.pictures || []).length >= 3) score += 3;
  if ((produto.pictures || []).length >= 5) score += 2;
  if (produto.quality_type === "COMPLETE") score += 5;
  if (produto.short_description?.content) score += 2;
  if (produto.product_standard) score += 2;
  if (!produto.children_ids?.length) score += 2;
  if (produto.buy_box_winner?.item_id) score += 8;

  return score;
}

function urlFallback(produto) {
  return `https://www.mercadolivre.com.br/${slug(produto.name)}/p/${produto.id}`;
}

function formatar(produto, categoria, termo, extras = {}) {
  return {
    id: produto.id,
    itemId: produto.buy_box_winner?.item_id || null,
    nome: produto.name,
    marca: marca(produto),
    imagem: produto.pictures?.[0]?.url || null,
    imagens: (produto.pictures || []).map(img => img.url),
    categoria,
    marketplace: "Mercado Livre",
    affiliateUrl: null,
    affiliateStatus: "pending",
    catalogUrl: urlFallback(produto),
    urlVerificada: false,
    preco: produto.buy_box_winner?.price || null,
    moeda: produto.buy_box_winner?.currency_id || "BRL",
    dominio: produto.domain_id || null,
    score: pontuar(produto, termo) + (extras.bonusScore || 0),
    origemSelecao: extras.origemSelecao || "CATALOG_SEARCH",
    rankingMaisVendido: extras.rankingMaisVendido || null,
    categoriaMercadoLivre: extras.categoriaMercadoLivre || produto.buy_box_winner?.category_id || null
  };
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

async function descobrirCategoria(termo) {
  const response = await axios.get(
    "https://api.mercadolibre.com/sites/MLB/domain_discovery/search",
    {
      params: { limit: 1, q: termo },
      headers: headers(),
      timeout: 12000
    }
  );
  return response.data?.[0] || null;
}

async function buscarHighlights(categoryId) {
  const response = await axios.get(
    `https://api.mercadolibre.com/highlights/MLB/category/${categoryId}`,
    {
      headers: headers(),
      timeout: 12000
    }
  );
  return response.data?.content || [];
}

async function buscarProduto(productId) {
  const response = await axios.get(
    `https://api.mercadolibre.com/products/${productId}`,
    {
      headers: headers(),
      timeout: 12000
    }
  );
  return response.data || null;
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

function produtoValido(produto, termo, rejeitados, aprovados, usados) {
  if (!produto?.id || !produto?.name || !produto?.pictures?.length) return false;
  if (produto.status && produto.status !== "active") return false;
  if (produto.children_ids?.length) return false;
  if (temRuido(produto)) return false;
  if (!aderenteAoTermo(produto, termo)) return false;
  if (rejeitados.has(produto.id)) return false;
  if (aprovados[produto.id]) return false;
  if (usados.has(produto.id)) return false;
  return true;
}

async function candidatosMaisVendidos(rejeitados, aprovados, usados) {
  const descobertas = await mapLimit(EXPANSAO_PRIORITARIA, 6, async busca => {
    const descoberta = await descobrirCategoria(busca.termo);
    if (!descoberta?.category_id) return null;

    const highlights = await buscarHighlights(descoberta.category_id);
    const produtosRanking = highlights
      .filter(h => h?.type === "PRODUCT" && /^MLB\d+$/.test(h.id || ""))
      .slice(0, 20);

    const detalhes = await mapLimit(produtosRanking, 6, async destaque => {
      const produto = await buscarProduto(destaque.id);
      return { produto, destaque };
    });

    return {
      ...busca,
      categoryId: descoberta.category_id,
      resultados: detalhes.filter(Boolean)
    };
  });

  const candidatos = [];

  for (const bloco of descobertas.filter(Boolean)) {
    for (const item of bloco.resultados || []) {
      const produto = item.produto;
      if (!produtoValido(produto, bloco.termo, rejeitados, aprovados, usados)) continue;
      if (!produto.buy_box_winner?.item_id) continue;

      usados.add(produto.id);
      const ranking = Number(item.destaque?.position) || 20;

      candidatos.push(
        formatar(produto, bloco.categoria, bloco.termo, {
          origemSelecao: "BEST_SELLER",
          rankingMaisVendido: ranking,
          categoriaMercadoLivre: bloco.categoryId,
          bonusScore: 5000 - ranking * 20
        })
      );
    }
  }

  return candidatos;
}

async function candidatosBuscaDireta(rejeitados, aprovados, usados) {
  const respostas = await mapLimit(EXPANSAO_PRIORITARIA, 8, async busca => ({
    ...busca,
    resultados: await pesquisarTermo(busca.termo)
  }));

  const candidatos = [];

  for (const resposta of respostas.filter(Boolean)) {
    for (const produto of resposta.resultados || []) {
      if (!produtoValido(produto, resposta.termo, rejeitados, aprovados, usados)) continue;

      usados.add(produto.id);
      candidatos.push(
        formatar(produto, resposta.categoria, resposta.termo, {
          origemSelecao: "CATALOG_SEARCH",
          bonusScore: 500
        })
      );
    }
  }

  return candidatos;
}

async function candidatosGerais(rejeitados, aprovados, usados) {
  const buscas = CATEGORIAS.flatMap(config =>
    config.termos.map(termo => ({ categoria: config.categoria, termo }))
  );

  const respostas = await mapLimit(buscas, 12, async busca => ({
    ...busca,
    resultados: await pesquisarTermo(busca.termo)
  }));

  const candidatos = [];

  for (const resposta of respostas.filter(Boolean)) {
    for (const produto of resposta.resultados || []) {
      if (!produtoValido(produto, resposta.termo, rejeitados, aprovados, usados)) continue;

      usados.add(produto.id);
      candidatos.push(formatar(produto, resposta.categoria, resposta.termo));
    }
  }

  return candidatos;
}

async function gerarCatalogo200() {
  const { aprovados, rejeitados } = await carregarRevisao();
  const catalogoAtual = await carregarCatalogoAtual();

  const preservados = [];
  const usados = new Set();

  for (const produto of catalogoAtual) {
    const affiliateUrl = aprovados[produto.id];
    if (!affiliateUrl || usados.has(produto.id)) continue;

    preservados.push({
      ...produto,
      affiliateUrl,
      affiliateStatus: "approved",
      score: Math.max(Number(produto.score) || 0, 1000)
    });
    usados.add(produto.id);
  }

  const falta = Math.max(0, TARGET_TOTAL - preservados.length);

  if (!falta) {
    return {
      projeto: "Casa no Capricho",
      marketplace: "Mercado Livre",
      geradoEm: new Date().toISOString(),
      criterio: "catálogo completo com produtos afiliados aprovados",
      quantidade: preservados.length,
      linksAtivos: preservados.length,
      pendentesAfiliado: 0,
      rejeitadosConhecidos: rejeitados.size,
      mercadoLivreFechado: false,
      categorias: Object.fromEntries(
        CATEGORIAS.map(c => [
          c.categoria,
          preservados.filter(p => p.categoria === c.categoria).length
        ])
      ),
      produtos: preservados
    };
  }

  const bestSellers = await candidatosMaisVendidos(rejeitados, aprovados, usados);
  const buscaDireta = await candidatosBuscaDireta(rejeitados, aprovados, usados);

  bestSellers.sort((a, b) =>
    (a.rankingMaisVendido || 999) - (b.rankingMaisVendido || 999) ||
    b.score - a.score ||
    a.nome.localeCompare(b.nome, "pt-BR")
  );

  buscaDireta.sort((a, b) =>
    b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR")
  );

  let candidatos = [...bestSellers, ...buscaDireta];

  if (candidatos.length < falta) {
    const gerais = await candidatosGerais(rejeitados, aprovados, usados);
    gerais.sort((a, b) =>
      b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR")
    );
    candidatos = [...candidatos, ...gerais];
  }

  const produtosFinais = [...preservados];
  const idsFinais = new Set(produtosFinais.map(p => p.id));
  const contagemCategoria = {};

  produtosFinais.forEach(p => {
    contagemCategoria[p.categoria] = (contagemCategoria[p.categoria] || 0) + 1;
  });

  for (const produto of candidatos) {
    if (produtosFinais.length >= TARGET_TOTAL) break;
    if (idsFinais.has(produto.id)) continue;

    if (
      produto.origemSelecao !== "BEST_SELLER" &&
      (contagemCategoria[produto.categoria] || 0) >= SOFT_CATEGORY_CAP
    ) {
      continue;
    }

    produtosFinais.push(produto);
    idsFinais.add(produto.id);
    contagemCategoria[produto.categoria] = (contagemCategoria[produto.categoria] || 0) + 1;
  }

  for (const produto of candidatos) {
    if (produtosFinais.length >= TARGET_TOTAL) break;
    if (idsFinais.has(produto.id)) continue;

    produtosFinais.push(produto);
    idsFinais.add(produto.id);
    contagemCategoria[produto.categoria] = (contagemCategoria[produto.categoria] || 0) + 1;
  }

  const linksAtivos = produtosFinais.filter(p => Boolean(p.affiliateUrl)).length;
  const bestSellersPendentes = produtosFinais.filter(
    p => !p.affiliateUrl && p.origemSelecao === "BEST_SELLER"
  ).length;

  const payload = {
    projeto: "Casa no Capricho",
    marketplace: "Mercado Livre",
    geradoEm: new Date().toISOString(),
    criterio: "181 aprovados preservados; nova rodada prioriza ranking oficial BEST_SELLER do Mercado Livre, produto ativo, buy box disponível, imagens e aderência ao nicho",
    quantidade: produtosFinais.length,
    linksAtivos,
    pendentesAfiliado: produtosFinais.length - linksAtivos,
    bestSellersPendentes,
    rejeitadosConhecidos: rejeitados.size,
    mercadoLivreFechado: false,
    categorias: Object.fromEntries(
      CATEGORIAS.map(c => [
        c.categoria,
        produtosFinais.filter(p => p.categoria === c.categoria).length
      ])
    ),
    produtos: produtosFinais
  };

  const temporario = CATALOG_PATH + ".tmp";
  await fs.writeFile(temporario, JSON.stringify(payload), "utf8");
  await fs.rename(temporario, CATALOG_PATH);

  return payload;
}

module.exports = {
  CATEGORIAS,
  EXPANSAO_PRIORITARIA,
  pesquisarTermo,
  gerarCatalogo200
};

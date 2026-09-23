const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { obterTokens } = require("../config/tokenStore");

const REVIEW_PATH = path.join(__dirname, "..", "data", "affiliate-review.json");
const CATALOG_PATH = path.join(__dirname, "..", "public", "data", "products.json");
const TARGET_TOTAL = 200;
const SOFT_CATEGORY_CAP = 30;

const CATEGORIAS = [
  { categoria: "Organização", termos: ["organizador gaveta", "organizador geladeira", "sapateira organizadora", "caixa organizadora", "organizador armario", "organizador cozinha", "cesto organizador", "prateleira organizadora", "colmeia organizadora", "organizador banheiro", "organizador despensa", "organizador acrilico"] },
  { categoria: "Cozinha", termos: ["potes hermeticos cozinha", "porta temperos cozinha", "escorredor louca", "cortador legumes", "utensilios cozinha", "organizador cozinha", "escorredor talheres", "porta mantimentos", "tábua cozinha", "porta utensilios cozinha", "kit potes cozinha", "dispenser cereais"] },
  { categoria: "Limpeza", termos: ["mop limpeza", "escova eletrica limpeza", "aspirador vertical casa", "limpa vidros", "rodo limpeza", "kit limpeza casa", "esfregao limpeza", "pano microfibra", "vassoura limpeza", "escova limpeza casa", "balde limpeza", "organizador produtos limpeza"] },
  { categoria: "Banheiro", termos: ["prateleira banheiro", "organizador box banheiro", "porta escovas banheiro", "dispenser sabonete banheiro", "armario banheiro", "suporte banheiro", "porta toalha banheiro", "nicho banheiro", "kit banheiro", "tapete banheiro", "porta shampoo banheiro", "lixeira banheiro"] },
  { categoria: "Decoração", termos: ["espelho decorativo casa", "vaso decorativo casa", "almofada decorativa", "quadro decorativo casa", "tapete decorativo", "decoracao sala", "nicho decorativo", "centro mesa decorativo", "bandeja decorativa", "porta retrato decorativo", "manta sofa", "enfeite sala"] },
  { categoria: "Quarto", termos: ["jogo de cama", "cabide veludo", "organizador roupas", "cortina blackout", "roupa de cama", "organizador guarda roupa", "caixa organizadora quarto", "colmeia organizadora", "capa travesseiro", "protetor colchao", "sapateira quarto", "cabide organizador"] },
  { categoria: "Lavanderia", termos: ["varal retratil", "cesto roupa suja", "organizador lavanderia", "saco organizador vacuo", "prateleira lavanderia", "cesto lavanderia", "armario lavanderia", "varal parede", "prendedor roupa", "capa maquina lavar", "saco lavar roupa", "cabide lavanderia"] },
  { categoria: "Iluminação", termos: ["luz sensor movimento", "fita led casa", "luminaria sem fio", "abajur decorativo", "luminaria led", "luz noturna", "luminaria mesa", "spot led", "plafon led casa", "luminaria cozinha", "luminaria quarto", "luminaria parede"] },
  { categoria: "Utilidades", termos: ["seladora alimentos", "balanca digital cozinha", "umidificador aromatizador", "dispenser automatico", "mini ventilador", "organizador multiuso", "suporte multiuso", "dispenser cozinha", "abridor multiuso", "suporte papel toalha", "porta sacolas", "dispenser detergente"] },
  { categoria: "Jardim", termos: ["vaso plantas decorativo", "kit jardinagem", "mangueira expansivel", "regador plantas", "suporte plantas", "jardim vertical", "vaso autoirrigavel", "ferramentas jardinagem", "tesoura poda", "pa jardinagem", "suporte vaso plantas", "pulverizador plantas"] }
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
  return `https://www.mercadolivre.com.br/${slug(produto.name)}/p/${produto.id}`;
}

function formatar(produto, categoria, termo) {
  return {
    id: produto.id,
    itemId: null,
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
    preco: null,
    moeda: "BRL",
    dominio: produto.domain_id || null,
    score: pontuar(produto, termo)
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

async function gerarCatalogo200() {
  const { aprovados, rejeitados } = await carregarRevisao();
  const catalogoAtual = await carregarCatalogoAtual();

  // Mantém para sempre os produtos cujo link já foi aprovado.
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

  const buscas = CATEGORIAS.flatMap(config =>
    config.termos.map(termo => ({ categoria: config.categoria, termo }))
  );

  const respostas = await mapLimit(buscas, 12, async busca => ({
    ...busca,
    resultados: await pesquisarTermo(busca.termo)
  }));

  const candidatos = [];
  const vistos = new Set(usados);

  for (const resposta of respostas.filter(Boolean)) {
    for (const produto of (resposta.resultados || [])) {
      if (!produto?.id || !produto?.name || !produto?.pictures?.length) continue;
      if (produto.status !== "active") continue;
      if (produto.children_ids?.length) continue;
      if (temRuido(produto)) continue;
      if (rejeitados.has(produto.id)) continue;
      if (aprovados[produto.id]) continue;
      if (vistos.has(produto.id)) continue;

      vistos.add(produto.id);
      candidatos.push(formatar(produto, resposta.categoria, resposta.termo));
    }
  }

  candidatos.sort((a, b) =>
    b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR")
  );

  const produtosFinais = [...preservados];
  const idsFinais = new Set(produtosFinais.map(p => p.id));
  const contagemCategoria = {};

  produtosFinais.forEach(p => {
    contagemCategoria[p.categoria] = (contagemCategoria[p.categoria] || 0) + 1;
  });

  // Primeiro mantém variedade entre categorias.
  for (const produto of candidatos) {
    if (produtosFinais.length >= TARGET_TOTAL) break;
    if (idsFinais.has(produto.id)) continue;
    if ((contagemCategoria[produto.categoria] || 0) >= SOFT_CATEGORY_CAP) continue;

    produtosFinais.push(produto);
    idsFinais.add(produto.id);
    contagemCategoria[produto.categoria] = (contagemCategoria[produto.categoria] || 0) + 1;
  }

  // Se ainda faltar, completa com os melhores restantes, sem travar por categoria.
  for (const produto of candidatos) {
    if (produtosFinais.length >= TARGET_TOTAL) break;
    if (idsFinais.has(produto.id)) continue;

    produtosFinais.push(produto);
    idsFinais.add(produto.id);
    contagemCategoria[produto.categoria] = (contagemCategoria[produto.categoria] || 0) + 1;
  }

  const linksAtivos = produtosFinais.filter(p => Boolean(p.affiliateUrl)).length;

  const payload = {
    projeto: "Casa no Capricho",
    marketplace: "Mercado Livre",
    geradoEm: new Date().toISOString(),
    criterio: "links aprovados preservados; novos candidatos ativos e não rejeitados, selecionados por relevancia, imagens e aderencia ao nicho",
    quantidade: produtosFinais.length,
    linksAtivos,
    pendentesAfiliado: produtosFinais.length - linksAtivos,
    rejeitadosConhecidos: rejeitados.size,
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
  pesquisarTermo,
  gerarCatalogo200
};

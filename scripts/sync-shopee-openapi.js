const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_URL = "https://open-api.affiliate.shopee.com.br/graphql";
const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_SECRET;
const BATCH_SIZE = Math.max(1, Math.min(30, Number(process.env.SHOPEE_BATCH_SIZE || 20)));
const DELAY_MS = Math.max(100, Number(process.env.SHOPEE_DELAY_MS || 450));

if (!APP_ID || !SECRET) {
  console.error("Credenciais ausentes. Configure SHOPEE_APP_ID e SHOPEE_SECRET.");
  process.exit(2);
}

const root = path.join(__dirname, "..");
const catalogDir = path.join(root, "public", "data", "shopee10k");
const mapPath = path.join(root, "public", "data", "shopee-affiliate-map.json");
const metaPath = path.join(root, "public", "data", "catalog-meta.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProducts() {
  const products = [];
  for (let i = 1; i <= 20; i++) {
    const file = path.join(catalogDir, "shard-" + String(i).padStart(2, "0") + ".json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const item of data.p || []) {
      products.push({
        itemId: String(item[0]),
        shopId: String(item[1])
      });
    }
  }
  return products;
}

function loadMap() {
  try {
    const data = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    if (!data.links || typeof data.links !== "object") data.links = {};
    return data;
  } catch {
    return {
      projeto: "Casa no Capricho",
      marketplace: "Shopee",
      versao: 2,
      descricao: "Links oficiais retornados pela Shopee Affiliate Open API.",
      linksConfirmados: 0,
      pendentes: 9633,
      atualizadoEm: null,
      links: {}
    };
  }
}

function persist(map, total) {
  map.versao = 2;
  map.descricao = "Links oficiais retornados pela Shopee Affiliate Open API (offerLink).";
  map.linksConfirmados = Object.keys(map.links).length;
  map.pendentes = Math.max(0, total - map.linksConfirmados);
  map.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(mapPath, JSON.stringify(map), "utf8");

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.shopeeAfiliadosConfirmados = 180 + map.linksConfirmados;
    meta.shopeePendentesConversao = map.pendentes;
    meta.ultimaSincronizacaoShopee = map.atualizadoEm;
    fs.writeFileSync(metaPath, JSON.stringify(meta), "utf8");
  } catch {}
}

function buildPayload(batch) {
  const fields = batch.map((p, index) => `
    p${index}: productOfferV2(itemId: ${p.itemId}, page: 1, limit: 1) {
      nodes { itemId offerLink productLink }
    }`).join("\n");

  return JSON.stringify({
    query: `query BatchOffers {\n${fields}\n}`
  });
}

function authHeader(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha256")
    .update(String(APP_ID) + String(timestamp) + payload + String(SECRET))
    .digest("hex");

  return `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`;
}

async function callApi(batch) {
  const payload = buildPayload(batch);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader(payload)
    },
    body: payload
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 600)}`);
    err.status = response.status;
    throw err;
  }

  if (body.errors && body.errors.length) {
    const err = new Error(`GraphQL: ${JSON.stringify(body.errors).slice(0, 800)}`);
    err.graphql = true;
    throw err;
  }

  return body.data || {};
}

async function resolveBatch(batch) {
  try {
    const data = await callApi(batch);
    const found = {};
    batch.forEach((p, index) => {
      const node = data["p" + index]?.nodes?.[0];
      if (node?.offerLink) found[String(node.itemId || p.itemId)] = node.offerLink;
    });
    return found;
  } catch (error) {
    const rateLimited = /10030|rate|too many|429/i.test(String(error.message));
    if (rateLimited) {
      await sleep(5000);
      try {
        const data = await callApi(batch);
        const found = {};
        batch.forEach((p, index) => {
          const node = data["p" + index]?.nodes?.[0];
          if (node?.offerLink) found[String(node.itemId || p.itemId)] = node.offerLink;
        });
        return found;
      } catch {}
    }

    if (batch.length === 1) {
      console.warn("Falhou item", batch[0].itemId, "-", error.message.slice(0, 180));
      return {};
    }

    const mid = Math.ceil(batch.length / 2);
    const left = await resolveBatch(batch.slice(0, mid));
    await sleep(DELAY_MS);
    const right = await resolveBatch(batch.slice(mid));
    return { ...left, ...right };
  }
}

async function main() {
  const products = loadProducts();
  if (products.length !== 9633) {
    throw new Error(`Catálogo inesperado: ${products.length}; esperado 9633.`);
  }

  const map = loadMap();
  const pending = products.filter(p => !map.links[p.itemId]);

  console.log("Shopee Open API sync");
  console.log("Total catálogo expandido:", products.length);
  console.log("Já confirmados:", Object.keys(map.links).length);
  console.log("Pendentes:", pending.length);
  console.log("Batch size:", BATCH_SIZE);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const found = await resolveBatch(batch);

    Object.assign(map.links, found);
    persist(map, products.length);

    const done = Math.min(i + batch.length, pending.length);
    console.log(
      `Processados ${done}/${pending.length} | encontrados nesta rodada: ${Object.keys(found).length} | total oficial: ${Object.keys(map.links).length}`
    );

    await sleep(DELAY_MS);
  }

  persist(map, products.length);
  console.log("Sincronização concluída.");
  console.log("Links oficiais novos/armazenados:", Object.keys(map.links).length);
  console.log("Pendentes:", map.pendentes);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

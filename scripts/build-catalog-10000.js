const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const partsDir = path.join(root, "public", "data", "shopee10k");
const outputDir = path.join(root, "public", "data", "shopee");
const outputFile = path.join(outputDir, "catalog-9633.json");

const PART_COUNT = 24;
const EXPECTED_PRODUCTS = 9633;
const EXPECTED_BASE64_LENGTH = 663040;
const EXPECTED_SHA256 = "e01fa10afdfb044a8d1c59aeb08974f724d5773f45e892d314a63c69219986eb";

const parts = Array.from({ length: PART_COUNT }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const file = path.join(partsDir, "part-" + number + ".txt");

  if (!fs.existsSync(file)) {
    throw new Error("Parte ausente do catálogo 10k: " + file);
  }

  const part = fs.readFileSync(file, "utf8").trim();
  const expectedLength = index === PART_COUNT - 1 ? 27619 : 27627;

  if (part.length !== expectedLength) {
    throw new Error(
      "Parte inválida " + number + ": " + part.length +
      " caracteres; esperado " + expectedLength
    );
  }

  return part;
});

const base64 = parts.join("");

if (base64.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(
    "Catálogo 10k incompleto: " + base64.length +
    " caracteres; esperado " + EXPECTED_BASE64_LENGTH
  );
}

const checksum = crypto
  .createHash("sha256")
  .update(base64, "utf8")
  .digest("hex");

if (checksum !== EXPECTED_SHA256) {
  throw new Error("Checksum catálogo 10k inválido: " + checksum);
}

const compact = JSON.parse(
  zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf8")
);

if (!Array.isArray(compact.c) || compact.c.length !== 11) {
  throw new Error("Categorias do catálogo Shopee inválidas.");
}

if (!Array.isArray(compact.p) || compact.p.length !== EXPECTED_PRODUCTS) {
  throw new Error(
    "Catálogo Shopee inválido. Esperado " + EXPECTED_PRODUCTS +
    " produtos, encontrado " +
    (Array.isArray(compact.p) ? compact.p.length : 0)
  );
}

const ids = new Set();
for (const item of compact.p) {
  if (!Array.isArray(item) || item.length < 6) {
    throw new Error("Registro compacto Shopee inválido.");
  }

  const id = String(item[0]);
  if (ids.has(id)) throw new Error("Item Shopee duplicado: " + id);
  ids.add(id);
}

let baseShopee = 0;
for (let i = 1; i <= 10; i++) {
  const number = String(i).padStart(2, "0");
  const file = path.join(outputDir, "shard-" + number + ".json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  baseShopee += Array.isArray(data.produtos) ? data.produtos.length : 0;
}

const mlFile = path.join(root, "public", "data", "products.json");
const ml = JSON.parse(fs.readFileSync(mlFile, "utf8"));
const mercadoLivre = Array.isArray(ml.produtos) ? ml.produtos.length : 0;
const total = baseShopee + compact.p.length + mercadoLivre;

if (baseShopee !== 180) {
  throw new Error("Base Shopee esperada: 180; encontrada: " + baseShopee);
}

if (mercadoLivre !== 187) {
  throw new Error("Mercado Livre esperado: 187; encontrado: " + mercadoLivre);
}

if (total !== 10000) {
  throw new Error("Total público esperado: 10000; encontrado: " + total);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(compact), "utf8");

const meta = {
  totalProdutos: total,
  shopee: baseShopee + compact.p.length,
  mercadoLivre,
  categorias: compact.c.length,
  geradoNoBuild: new Date().toISOString()
};

fs.writeFileSync(
  path.join(root, "public", "data", "catalog-meta.json"),
  JSON.stringify(meta),
  "utf8"
);

console.log("Catálogo Casa no Capricho validado.");
console.log("Shopee:", meta.shopee);
console.log("Mercado Livre:", meta.mercadoLivre);
console.log("Total:", meta.totalProdutos);
console.log("Checksum:", checksum);

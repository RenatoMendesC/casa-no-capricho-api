const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const base = path.join(__dirname, "..", "public", "data", "shopee");
const EXPECTED_SHA256 = "2da192dfe4be8a4e8101c57483479b64c442239b4fb34a5a1ae2dc1517866edb";

const base64 = Array.from({ length: 16 }, (_, index) => {
  const file = path.join(base, "add1000-" + String(index + 1).padStart(2, "0") + ".txt");
  if (!fs.existsSync(file)) {
    throw new Error("Arquivo ausente: " + file);
  }

  const part = fs.readFileSync(file, "utf8").trim();
  if (part.length !== 4961) {
    throw new Error("Parte inválida: " + path.basename(file) + " (" + part.length + " caracteres)");
  }

  return part;
}).join("");

if (base64.length !== 79376) {
  throw new Error("Catálogo compactado incompleto: " + base64.length + " caracteres");
}

const checksum = crypto.createHash("sha256").update(base64, "utf8").digest("hex");
if (checksum !== EXPECTED_SHA256) {
  throw new Error("Checksum do catálogo Shopee inválido: " + checksum);
}

const compact = JSON.parse(
  zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf8")
);

if (!Array.isArray(compact.p) || compact.p.length !== 1000) {
  throw new Error(
    "Catálogo Shopee extra inválido. Esperado 1000 produtos, encontrado " +
    (Array.isArray(compact.p) ? compact.p.length : 0)
  );
}

const output = path.join(base, "extra-1000.json");
fs.writeFileSync(output, JSON.stringify(compact), "utf8");

console.log("Checksum Shopee OK:", checksum);
console.log("Shopee extra gerado:", compact.p.length, "produtos");

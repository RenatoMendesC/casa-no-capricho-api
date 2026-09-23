const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const base = path.join(__dirname, "..", "public", "data", "shopee");

const base64 = Array.from({ length: 16 }, (_, index) => {
  const file = path.join(base, "add1000-" + String(index + 1).padStart(2, "0") + ".txt");
  if (!fs.existsSync(file)) {
    throw new Error("Arquivo ausente: " + file);
  }
  return fs.readFileSync(file, "utf8").trim();
}).join("");

const compact = JSON.parse(
  zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf8")
);

if (!Array.isArray(compact.p) || compact.p.length !== 1000) {
  throw new Error("Catálogo Shopee extra inválido. Esperado 1000 produtos.");
}

const output = path.join(base, "extra-1000.json");
fs.writeFileSync(output, JSON.stringify(compact), "utf8");

console.log("Shopee extra gerado:", compact.p.length, "produtos");

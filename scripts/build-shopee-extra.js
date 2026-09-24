const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const base = path.join(__dirname, "..", "public", "data", "shopee");
const EXPECTED_SHA256 = "9d66fde39a836cf2644f37b7b333980ac7015520889d0a48d6f0635586d0dffc";

const parts = Array.from({ length: 16 }, (_, index) => {
  const file = path.join(base, "add1000-" + String(index + 1).padStart(2, "0") + ".txt");

  if (!fs.existsSync(file)) {
    throw new Error("Arquivo ausente: " + file);
  }

  const part = fs.readFileSync(file, "utf8").trim();
  const expectedLength = index === 15 ? 4836 : 4864;

  if (part.length !== expectedLength) {
    throw new Error(
      "Parte inválida: " + path.basename(file) +
      " (" + part.length + " caracteres; esperado " + expectedLength + ")"
    );
  }

  return part;
});

const base64 = parts.join("");

if (base64.length !== 77796) {
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

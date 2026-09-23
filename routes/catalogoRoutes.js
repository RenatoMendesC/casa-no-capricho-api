const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { pesquisarTermo } = require("../services/catalogoService");

const router = express.Router();

router.get("/buscar", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({
        erro: "Informe ?q=produto"
      });
    }

    const resultados = await pesquisarTermo(q);

    res.json({
      busca: q,
      quantidade: resultados.length,
      produtos: resultados
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
});

router.get("/lote200", async (req, res) => {
  try {
    const arquivo = path.join(__dirname, "..", "public", "data", "products.json");
    const conteudo = await fs.readFile(arquivo, "utf8");
    res.type("application/json").send(conteudo);
  } catch (error) {
    res.status(500).json({
      erro: "Não foi possível ler o catálogo."
    });
  }
});

module.exports = router;

const express = require("express");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { pesquisarTermo } = require("../services/catalogoService");

const router = express.Router();

const precoCache = new Map();
const PRECO_CACHE_TTL = 10 * 60 * 1000;

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function buscarPrecoCatalogo(id) {
  const cached = precoCache.get(id);
  if (cached && Date.now() - cached.cachedAt < PRECO_CACHE_TTL) {
    return cached.data;
  }

  const response = await axios.get(
    `https://api.mercadolibre.com/products/${encodeURIComponent(id)}`,
    {
      timeout: 10000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Casa-no-Capricho/1.0"
      }
    }
  );

  const produto = response.data || {};
  const winner = produto.buy_box_winner || null;

  const data = {
    id,
    preco: winner?.price ?? null,
    moeda: winner?.currency_id || "BRL",
    itemId: winner?.item_id || null,
    disponivel: Boolean(winner?.price)
  };

  precoCache.set(id, { cachedAt: Date.now(), data });
  return data;
}

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

router.get("/precos", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map(id => id.trim().toUpperCase())
      .filter(id => /^MLB\d+$/.test(id));

    const unicos = [...new Set(ids)].slice(0, 40);

    if (!unicos.length) {
      return res.status(400).json({
        erro: "Informe ?ids=MLB123,MLB456"
      });
    }

    const resultados = [];

    for (const lote of chunk(unicos, 8)) {
      const respostas = await Promise.all(
        lote.map(async id => {
          try {
            return await buscarPrecoCatalogo(id);
          } catch (error) {
            return {
              id,
              preco: null,
              moeda: "BRL",
              itemId: null,
              disponivel: false,
              erro: error.response?.status || error.message
            };
          }
        })
      );
      resultados.push(...respostas);
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json({
      quantidade: resultados.length,
      produtos: resultados
    });
  } catch (error) {
    res.status(500).json({
      erro: "Não foi possível consultar os preços do Mercado Livre."
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

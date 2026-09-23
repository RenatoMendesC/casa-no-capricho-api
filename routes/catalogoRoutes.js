const express = require("express");
const axios = require("axios");
const { obterTokens } = require("../config/tokenStore");

const router = express.Router();

function pegarMarca(produto) {
  const marca = produto.attributes?.find(a => a.id === "BRAND");
  return marca?.value_name || null;
}

router.get("/buscar", async (req, res) => {
  try {
    const q = req.query.q;

    if (!q) {
      return res.status(400).json({
        erro: "Informe ?q=produto"
      });
    }

    const tokens = obterTokens();

    if (!tokens?.access_token) {
      return res.status(401).json({
        erro: "Mercado Livre não está conectado."
      });
    }

    const headers = {
      Authorization: `Bearer ${tokens.access_token}`
    };

    // Busca produtos de catálogo
    const busca = await axios.get(
      "https://api.mercadolibre.com/products/search",
      {
        params: {
          status: "active",
          site_id: "MLB",
          q
        },
        headers
      }
    );

    const resultados = busca.data.results || [];

    // Consulta detalhes de cada produto
    const produtos = await Promise.all(
      resultados.map(async (produto) => {
        try {
          const detalhe = await axios.get(
            `https://api.mercadolibre.com/products/${produto.id}`,
            { headers }
          );

          const d = detalhe.data;
          const vencedor = d.buy_box_winner || {};

          return {
            catalogId: produto.id,
            itemId: vencedor.item_id || null,
            nome: produto.name,
            marca: pegarMarca(produto),
            preco: vencedor.price ?? null,
            moeda: vencedor.currency_id || "BRL",

            imagem:
              produto.pictures?.[0]?.url ||
              d.pictures?.[0]?.url ||
              null,

            imagens:
              (produto.pictures || [])
                .map(img => img.url),

            link:
              d.permalink || null,

            categoria:
              vencedor.category_id ||
              produto.domain_id ||
              null
          };

        } catch (erro) {
          return {
            catalogId: produto.id,
            itemId: null,
            nome: produto.name,
            marca: pegarMarca(produto),
            preco: null,
            moeda: "BRL",

            imagem:
              produto.pictures?.[0]?.url ||
              null,

            imagens:
              (produto.pictures || [])
                .map(img => img.url),

            link: null,
            categoria: produto.domain_id
          };
        }
      })
    );

    res.json({
      busca: q,
      quantidade: produtos.length,
      produtos
    });

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
});

module.exports = router;

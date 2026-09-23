const express = require("express");
const axios = require("axios");
const { obterTokens } = require("../config/tokenStore");

const router = express.Router();

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

    const response = await axios.get(
      "https://api.mercadolibre.com/products/search",
      {
        params: {
          status: "active",
          site_id: "MLB",
          q
        },
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
});

module.exports = router;

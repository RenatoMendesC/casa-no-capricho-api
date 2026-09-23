const express = require("express");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { pesquisarTermo } = require("../services/catalogoService");
const { obterTokens } = require("../config/tokenStore");

const router = express.Router();

const precoCache = new Map();
const PRECO_CACHE_TTL = 10 * 60 * 1000;

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function carregarCatalogoMercadoLivre() {
  try {
    const arquivo = path.join(__dirname, "..", "public", "data", "products.json");
    const conteudo = JSON.parse(await fs.readFile(arquivo, "utf8"));
    return Array.isArray(conteudo.produtos) ? conteudo.produtos : [];
  } catch {
    return [];
  }
}

function authHeadersOpcionais() {
  const tokens = obterTokens();
  if (!tokens?.access_token) return {};
  return { Authorization: `Bearer ${tokens.access_token}` };
}

function extrairPrecoJsonLd(html) {
  const scripts = String(html || "").match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  function encontrarPreco(value) {
    if (!value) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const preco = encontrarPreco(item);
        if (preco) return preco;
      }
      return null;
    }

    if (typeof value !== "object") return null;

    if (value.offers) {
      const offers = Array.isArray(value.offers) ? value.offers : [value.offers];
      for (const offer of offers) {
        const amount = Number(offer?.price ?? offer?.lowPrice);
        if (Number.isFinite(amount) && amount > 0) {
          return {
            preco: amount,
            moeda: offer?.priceCurrency || "BRL"
          };
        }
      }
    }

    if (
      (value["@type"] === "Offer" || value["@type"] === "AggregateOffer") &&
      Number.isFinite(Number(value.price ?? value.lowPrice))
    ) {
      return {
        preco: Number(value.price ?? value.lowPrice),
        moeda: value.priceCurrency || "BRL"
      };
    }

    for (const child of Object.values(value)) {
      const preco = encontrarPreco(child);
      if (preco) return preco;
    }

    return null;
  }

  for (const script of scripts) {
    const jsonText = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(jsonText);
      const found = encontrarPreco(parsed);
      if (found) return found;
    } catch {}
  }

  return null;
}

function extrairPrecoHtml(html) {
  const source = String(html || "");

  const jsonLd = extrairPrecoJsonLd(source);
  if (jsonLd) return jsonLd;

  const patterns = [
    /itemprop=["']price["'][^>]*content=["']([0-9]+(?:[.,][0-9]+)?)["']/i,
    /content=["']([0-9]+(?:[.,][0-9]+)?)["'][^>]*itemprop=["']price["']/i,
    /"price"\s*:\s*"([0-9]+(?:\.[0-9]+)?)"/i,
    /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)[\s\S]{0,120}"currency_id"\s*:\s*"BRL"/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const amount = Number(String(match[1]).replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      return { preco: amount, moeda: "BRL" };
    }
  }

  return null;
}

async function buscarPrecoPagina(url) {
  if (!url) return null;

  try {
    const response = await axios.get(url, {
      timeout: 12000,
      maxRedirects: 8,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
      }
    });

    return extrairPrecoHtml(response.data);
  } catch {
    return null;
  }
}

async function buscarPrecoCatalogo(id, catalogItem) {
  const cached = precoCache.get(id);
  if (cached && Date.now() - cached.cachedAt < PRECO_CACHE_TTL) {
    return cached.data;
  }

  let data = {
    id,
    preco: null,
    moeda: "BRL",
    itemId: null,
    disponivel: false,
    origemPreco: null
  };

  // 1. Tenta a página de produto do catálogo; se o token estiver ativo,
  //    a resposta pode incluir a publicação vencedora e o preço atual.
  try {
    const response = await axios.get(
      `https://api.mercadolibre.com/products/${encodeURIComponent(id)}`,
      {
        timeout: 10000,
        headers: {
          Accept: "application/json",
          ...authHeadersOpcionais()
        }
      }
    );

    const produto = response.data || {};
    const winner = produto.buy_box_winner || null;

    if (winner?.price) {
      data = {
        id,
        preco: Number(winner.price),
        moeda: winner.currency_id || "BRL",
        itemId: winner.item_id || null,
        disponivel: true,
        origemPreco: "catalog_buy_box"
      };
    } else if (winner?.item_id) {
      try {
        const priceResponse = await axios.get(
          `https://api.mercadolibre.com/items/${encodeURIComponent(winner.item_id)}/prices`,
          {
            timeout: 10000,
            headers: {
              Accept: "application/json",
              ...authHeadersOpcionais()
            }
          }
        );

        const prices = priceResponse.data?.prices || [];
        const promotion = prices.find(p => p.type === "promotion");
        const standard = prices.find(p => p.type === "standard");
        const selected = promotion || standard || prices[0];

        if (selected?.amount) {
          data = {
            id,
            preco: Number(selected.amount),
            moeda: selected.currency_id || "BRL",
            itemId: winner.item_id,
            disponivel: true,
            origemPreco: "item_prices"
          };
        }
      } catch {}
    }
  } catch {}

  // 2. Fallback independente de OAuth: lê os dados estruturados
  //    da página pública vinculada ao próprio link de afiliado.
  if (!data.disponivel && catalogItem) {
    const pagePrice =
      (await buscarPrecoPagina(catalogItem.affiliateUrl)) ||
      (await buscarPrecoPagina(catalogItem.catalogUrl));

    if (pagePrice?.preco) {
      data = {
        id,
        preco: Number(pagePrice.preco),
        moeda: pagePrice.moeda || "BRL",
        itemId: catalogItem.itemId || null,
        disponivel: true,
        origemPreco: "public_offer_page"
      };
    }
  }

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

    const unicos = [...new Set(ids)].slice(0, 20);

    if (!unicos.length) {
      return res.status(400).json({
        erro: "Informe ?ids=MLB123,MLB456"
      });
    }

    const catalogo = await carregarCatalogoMercadoLivre();
    const catalogMap = new Map(catalogo.map(produto => [produto.id, produto]));
    const resultados = [];

    for (const lote of chunk(unicos, 5)) {
      const respostas = await Promise.all(
        lote.map(async id => {
          try {
            return await buscarPrecoCatalogo(id, catalogMap.get(id));
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

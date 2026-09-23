const express = require("express");
const axios = require("axios");
const { obterTokens } = require("../config/tokenStore");

const router = express.Router();

function getHeaders() {
  const tokens = obterTokens();

  if (!tokens?.access_token) {
    throw new Error("Mercado Livre não está conectado.");
  }

  return {
    Authorization: `Bearer ${tokens.access_token}`
  };
}

function pegarMarca(produto) {
  const marca = produto.attributes?.find(
    atributo => atributo.id === "BRAND"
  );

  return marca?.value_name || null;
}

function formatarProduto(produto, categoriaSite) {
  return {
    catalogId: produto.id,
    nome: produto.name,
    marca: pegarMarca(produto),

    imagem:
      produto.pictures?.[0]?.url ||
      null,

    imagens:
      (produto.pictures || [])
        .map(imagem => imagem.url),

    categoria: categoriaSite,
    dominio: produto.domain_id || null,

    status: produto.status,
    descricao:
      produto.short_description?.content ||
      null
  };
}

async function pesquisarCatalogo(termo) {
  const response = await axios.get(
    "https://api.mercadolibre.com/products/search",
    {
      params: {
        status: "active",
        site_id: "MLB",
        q: termo
      },
      headers: getHeaders()
    }
  );

  return response.data.results || [];
}


// ======================================
// BUSCA NORMAL
// ======================================

router.get("/buscar", async (req, res) => {
  try {

    const q = req.query.q;

    if (!q) {
      return res.status(400).json({
        erro: "Informe ?q=produto"
      });
    }

    const resultados =
      await pesquisarCatalogo(q);

    const produtos = resultados.map(produto =>
      formatarProduto(produto, "Pesquisa")
    );

    res.json({
      busca: q,
      quantidade: produtos.length,
      produtos
    });

  } catch (error) {

    res
      .status(error.response?.status || 500)
      .json({
        erro:
          error.response?.data ||
          error.message
      });

  }
});


// ======================================
// LOTE AUTOMATICO DE 50 PRODUTOS
// ======================================

router.get("/lote50", async (req, res) => {

  try {

    const categorias = [

      {
        categoria: "Organização",
        busca: "organizador casa"
      },

      {
        categoria: "Cozinha",
        busca: "utilidades cozinha"
      },

      {
        categoria: "Limpeza",
        busca: "limpeza casa"
      },

      {
        categoria: "Banheiro",
        busca: "organizador banheiro"
      },

      {
        categoria: "Decoração",
        busca: "decoracao casa"
      }

    ];

    const produtosFinais = [];

    const idsUsados = new Set();

    for (const item of categorias) {

      try {

        const resultados =
          await pesquisarCatalogo(
            item.busca
          );

        let adicionados = 0;

        for (const produto of resultados) {

          if (adicionados >= 10) {
            break;
          }

          if (
            idsUsados.has(produto.id)
          ) {
            continue;
          }

          if (
            !produto.name ||
            !produto.pictures?.length
          ) {
            continue;
          }

          idsUsados.add(produto.id);

          produtosFinais.push(
            formatarProduto(
              produto,
              item.categoria
            )
          );

          adicionados++;

        }

      } catch (erroCategoria) {

        console.error(
          "Erro categoria:",
          item.categoria,
          erroCategoria.response?.data ||
          erroCategoria.message
        );

      }

    }

    res.json({

      projeto: "Casa no Capricho",

      marketplace:
        "Mercado Livre",

      quantidade:
        produtosFinais.length,

      categorias: {
        organizacao:
          produtosFinais.filter(
            p =>
              p.categoria ===
              "Organização"
          ).length,

        cozinha:
          produtosFinais.filter(
            p =>
              p.categoria ===
              "Cozinha"
          ).length,

        limpeza:
          produtosFinais.filter(
            p =>
              p.categoria ===
              "Limpeza"
          ).length,

        banheiro:
          produtosFinais.filter(
            p =>
              p.categoria ===
              "Banheiro"
          ).length,

        decoracao:
          produtosFinais.filter(
            p =>
              p.categoria ===
              "Decoração"
          ).length
      },

      produtos:
        produtosFinais

    });

  } catch (error) {

    res
      .status(error.response?.status || 500)
      .json({
        erro:
          error.response?.data ||
          error.message
      });

  }

});

module.exports = router;

const {
  gerarUrlAutorizacao,
  trocarCodePorToken,
  consultarProduto,
  consultarProdutos,
  statusAplicacao
} = require("../services/mercadoLivreService");

const { salvarTokens } = require("../config/tokenStore");

function login(req, res) {
  res.redirect(gerarUrlAutorizacao());
}

async function callback(req, res) {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({
      erro: "Código ou state não recebido."
    });
  }

  try {
    const tokens = await trocarCodePorToken(code, state);

    salvarTokens(tokens);

    res.send(`
      <h1>Casa no Capricho</h1>
      <h2>Mercado Livre conectado com sucesso!</h2>
      <p>User ID: ${tokens.user_id}</p>
    `);

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
}

async function produto(req, res) {
  try {
    if (!req.query.id) {
      return res.status(400).json({
        erro: "Informe ?id=MLB..."
      });
    }

    res.json(
      await consultarProduto(req.query.id.trim().toUpperCase())
    );

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
}

async function produtos(req, res) {
  try {
    if (!req.query.ids) {
      return res.status(400).json({
        erro: "Informe ?ids=MLB1,MLB2..."
      });
    }

    res.json(
      await consultarProdutos(req.query.ids)
    );

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
}

async function status(req, res) {
  try {
    res.json(await statusAplicacao());

  } catch (error) {
    res.status(error.response?.status || 500).json({
      erro: error.response?.data || error.message
    });
  }
}

module.exports = {
  login,
  callback,
  produto,
  produtos,
  status
};

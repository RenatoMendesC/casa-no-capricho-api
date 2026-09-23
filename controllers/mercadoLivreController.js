const {
  gerarUrlAutorizacao,
  trocarCodePorToken
} = require("../services/mercadoLivreService");

function login(req, res) {
  const url = gerarUrlAutorizacao();

  res.redirect(url);
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

    console.log("Mercado Livre conectado.");
    console.log("User ID:", tokens.user_id);

    // NÃO mostrar access_token ou refresh_token na tela.
    // Depois vamos salvar isso corretamente no banco.

    res.send(`
      <h1>Casa no Capricho</h1>
      <h2>Mercado Livre conectado com sucesso!</h2>
      <p>User ID: ${tokens.user_id}</p>
      <p>Já podemos começar a integrar os produtos.</p>
    `);

  } catch (error) {
    console.error(
      error.response?.data ||
      error.message
    );

    res.status(500).json({
      erro: "Erro ao autenticar com Mercado Livre",
      detalhes:
        error.response?.data ||
        error.message
    });
  }
}

module.exports = {
  login,
  callback
};
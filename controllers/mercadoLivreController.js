const {
  gerarUrlAutorizacao,
  trocarCodePorToken,
  consultarProduto,
  consultarProdutos,
  statusAplicacao
} = require("../services/mercadoLivreService");

const { gerarCatalogo200 } = require("../services/catalogoService");
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

    let catalogo = null;
    let aviso = null;

    try {
      catalogo = await gerarCatalogo200();
    } catch (error) {
      aviso = error.response?.data || error.message;
    }

    const quantidade = catalogo?.quantidade || 0;

    res.send(`
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Casa no Capricho</title>
        <style>
          body{margin:0;font-family:Arial,sans-serif;background:#f7f3ec;color:#253128;display:grid;place-items:center;min-height:100vh;padding:24px}
          .card{max-width:620px;background:#fff;border:1px solid #e7e1d8;border-radius:28px;padding:34px;box-shadow:0 18px 60px rgba(45,54,45,.10);text-align:center}
          h1{font-family:Georgia,serif;margin:0 0 10px;font-size:38px}
          p{color:#6f786f;line-height:1.6}
          .ok{display:inline-block;background:#e8eee4;color:#52654c;border-radius:999px;padding:8px 12px;font-weight:700;font-size:13px}
          a{display:inline-block;margin-top:18px;background:#718568;color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:700}
          .warn{margin-top:18px;padding:12px;border-radius:14px;background:#fff5e9;color:#8a5b32;font-size:13px}
        </style>
      </head>
      <body>
        <div class="card">
          <span class="ok">Mercado Livre conectado</span>
          <h1>Casa no Capricho</h1>
          <p>${quantidade ? `Catálogo atualizado com ${quantidade} produtos.` : "Conexão concluída."}</p>
          ${aviso ? `<div class="warn">O catálogo não foi atualizado agora: ${String(aviso)}</div>` : ""}
          <a href="/">Ver o site</a>
        </div>
      </body>
      </html>
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

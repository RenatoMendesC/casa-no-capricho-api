const axios = require("axios");
const crypto = require("crypto");
const { obterTokens } = require("../config/tokenStore");

const pkceStore = new Map();

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function gerarUrlAutorizacao() {
  const codeVerifier = base64url(crypto.randomBytes(64));

  const codeChallenge = base64url(
    crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest()
  );

  const state = base64url(crypto.randomBytes(32));

  pkceStore.set(state, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.MELI_CLIENT_ID,
    redirect_uri: process.env.MELI_REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });

  return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
}

async function trocarCodePorToken(code, state) {
  const codeVerifier = pkceStore.get(state);

  if (!codeVerifier) {
    throw new Error("State ou PKCE inválido.");
  }

  const params = new URLSearchParams();

  params.append("grant_type", "authorization_code");
  params.append("client_id", process.env.MELI_CLIENT_ID);
  params.append("client_secret", process.env.MELI_CLIENT_SECRET);
  params.append("code", code);
  params.append("redirect_uri", process.env.MELI_REDIRECT_URI);
  params.append("code_verifier", codeVerifier);

  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    params,
    {
      headers: {
        accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  pkceStore.delete(state);

  return response.data;
}

async function buscarProdutos(termo) {
  const tokens = obterTokens();

  if (!tokens?.access_token) {
    throw new Error("Mercado Livre não está conectado.");
  }

  const response = await axios.get(
    "https://api.mercadolibre.com/sites/MLB/search",
    {
      params: {
        q: termo,
        limit: 20
      },
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    }
  );

  return response.data.results.map((produto) => ({
    id: produto.id,
    nome: produto.title,
    preco: produto.price,
    imagem: produto.thumbnail
      ? produto.thumbnail.replace("http://", "https://")
      : null,
    linkOriginal: produto.permalink,
    categoria: produto.category_id
  }));
}

module.exports = {
  gerarUrlAutorizacao,
  trocarCodePorToken,
  buscarProdutos
};

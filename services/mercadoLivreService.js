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
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  pkceStore.delete(state);

  return response.data;
}

function getAuthHeaders() {
  const tokens = obterTokens();

  if (!tokens?.access_token) {
    throw new Error("Mercado Livre não está conectado.");
  }

  return {
    Authorization: `Bearer ${tokens.access_token}`
  };
}

async function consultarMinhaConta() {
  const response = await axios.get(
    "https://api.mercadolibre.com/users/me",
    {
      headers: getAuthHeaders()
    }
  );

  return response.data;
}

async function consultarProduto(id) {
  const response = await axios.get(
    `https://api.mercadolibre.com/items/${id}`,
    {
      headers: getAuthHeaders()
    }
  );

  const p = response.data;

  return {
    id: p.id,
    nome: p.title,
    preco: p.price,
    moeda: p.currency_id,
    categoria: p.category_id,
    condicao: p.condition,
    linkOriginal: p.permalink,
    imagemPrincipal: p.pictures?.[0]?.secure_url || null,
    imagens: (p.pictures || []).map(img => img.secure_url)
  };
}

async function consultarProdutos(ids) {
  const lista = ids
    .split(",")
    .map(id => id.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  const response = await axios.get(
    "https://api.mercadolibre.com/items/bulk",
    {
      params: {
        ids: lista.join(",")
      },
      headers: getAuthHeaders()
    }
  );

  return response.data.map(item => {
    const p = item.body || {};

    return {
      status: item.status_code,
      id: item.id || p.id,
      nome: p.title || null,
      preco: p.price ?? null,
      moeda: p.currency_id || null,
      categoria: p.category_id || null,
      linkOriginal: p.permalink || null,
      imagemPrincipal:
        p.pictures?.[0]?.secure_url || null,
      imagens:
        (p.pictures || []).map(img => img.secure_url)
    };
  });
}

module.exports = {
  gerarUrlAutorizacao,
  trocarCodePorToken,
  consultarMinhaConta,
  consultarProduto,
  consultarProdutos
};

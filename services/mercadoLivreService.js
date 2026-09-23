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

  return response.data;
}

async function statusAplicacao() {
  const tokens = obterTokens();

  if (!tokens?.access_token) {
    throw new Error("Mercado Livre não está conectado.");
  }

  const response = await axios.get(
    `https://api.mercadolibre.com/applications/${process.env.MELI_CLIENT_ID}`,
    {
      headers: getAuthHeaders()
    }
  );

  return {
    active: response.data.active,
    site_id: response.data.site_id,
    scopes: response.data.scopes,
    domains: response.data.domains,
    certification_status: response.data.certification_status,
    token_scope: tokens.scope
  };
}

module.exports = {
  gerarUrlAutorizacao,
  trocarCodePorToken,
  consultarProduto,
  consultarProdutos,
  statusAplicacao
};

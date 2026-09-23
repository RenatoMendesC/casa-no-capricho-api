let tokenData = null;

function salvarTokens(tokens) {
  tokenData = tokens;
}

function obterTokens() {
  return tokenData;
}

module.exports = {
  salvarTokens,
  obterTokens
};

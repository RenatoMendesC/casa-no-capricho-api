require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const mercadoLivreRoutes = require("./routes/mercadoLivreRoutes");
const catalogoRoutes = require("./routes/catalogoRoutes");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h"
}));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    projeto: "Casa no Capricho",
    timestamp: new Date().toISOString()
  });
});

app.use("/auth/mercadolivre", mercadoLivreRoutes);
app.use("/api/catalogo", catalogoRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({
    erro: "Rota de API não encontrada."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Casa no Capricho rodando na porta " + PORT);
});

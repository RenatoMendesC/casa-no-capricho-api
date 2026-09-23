require("dotenv").config();

const express = require("express");
const cors = require("cors");

const mercadoLivreRoutes = require("./routes/mercadoLivreRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <h1>Casa no Capricho API</h1>
    <p>API funcionando.</p>

    <a href="/auth/mercadolivre/login">
      Conectar Mercado Livre
    </a>
  `);
});

app.use(
  "/auth/mercadolivre",
  mercadoLivreRoutes
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
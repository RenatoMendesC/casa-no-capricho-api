const express = require("express");

const {
  login,
  callback,
  produto,
  produtos,
  status
} = require("../controllers/mercadoLivreController");

const router = express.Router();

router.get("/login", login);
router.get("/callback", callback);
router.get("/produto", produto);
router.get("/produtos", produtos);
router.get("/app-status", status);

module.exports = router;

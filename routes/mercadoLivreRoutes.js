const express = require("express");

const {
  login,
  callback,
  me,
  produto,
  produtos
} = require("../controllers/mercadoLivreController");

const router = express.Router();

router.get("/login", login);
router.get("/callback", callback);
router.get("/me", me);
router.get("/produto", produto);
router.get("/produtos", produtos);

module.exports = router;

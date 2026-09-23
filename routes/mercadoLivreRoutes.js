const express = require("express");

const {
  login,
  callback,
  buscar
} = require("../controllers/mercadoLivreController");

const router = express.Router();

router.get("/login", login);
router.get("/callback", callback);
router.get("/buscar", buscar);

module.exports = router;

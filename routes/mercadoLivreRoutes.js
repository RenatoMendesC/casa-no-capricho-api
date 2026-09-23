const express = require("express");

const {
  login,
  callback
} = require("../controllers/mercadoLivreController");

const router = express.Router();

router.get("/login", login);

router.get("/callback", callback);

module.exports = router;
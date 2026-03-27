const express = require('express');
const router = express.Router();
const { login } = require('../controllers/auth.controller');

// POST /api/login — ruta pública, no requiere token
router.post('/login', login);

module.exports = router;

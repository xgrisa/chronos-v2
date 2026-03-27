const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getTimers, createTimer, controlTimer, deleteTimer } = require('../controllers/timer.controller');

// Aplicamos el middleware a todas las rutas de este fichero de una vez.
// Cualquier petición que llegue aquí sin token válido recibe un 401.
router.use(authMiddleware);

router.get('/',       getTimers);
router.post('/',      createTimer);
router.patch('/:id',  controlTimer);
router.delete('/:id', deleteTimer);

module.exports = router;

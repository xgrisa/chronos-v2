require('dotenv').config(); // debe ser la primera línea para que las variables de entorno estén disponibles desde el inicio
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const timerRoutes = require('./routes/timer.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales — se aplican a todas las peticiones
app.use(cors());
app.use(express.json()); // permite leer req.body como objeto JS

// Rutas
app.use('/api', authRoutes);         // POST /api/login
app.use('/api/timers', timerRoutes); // GET, POST, PATCH, DELETE /api/timers

// Ruta de salud — útil para comprobar que el backend está vivo desde Traefik o cualquier monitor
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Chronos backend escuchando en puerto ${PORT}`);
});

// Importa librería jsonwebtoken para verificar que los tokens sean válidos
const jwt = require('jsonwebtoken');

// Creamos la función, con los parámetros de la request, la response y el next
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // El header debe llegar con formato: "Bearer <token>", si viene vacío o no lo hace, retorna el 401
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  // Separamos el bearer del token real
  const token = authHeader.split(' ')[1];

  try {
    // Verifica la firma del token con el secret.
    // Si el token está manipulado o ha expirado, lanza un error.
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Añadimos los datos del usuario a req para que los controladores los usen y no tengamos que pedir siempre la autenticación para cada llamada a la api
    req.user = { id: payload.id, username: payload.username };

    next(); // todo OK, pasamos al controlador
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;

// Importamos librerías
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

async function login(req, res) {
  // Extraemos el usuario y la contraseña del form del login
  const { username, password } = req.body;

  // Si vienen vacíos: 400
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  // Pasamos la consulta a través de una de las conexiones del pool y le damos un await al js para que no coja result vacío y le dé tiempo a cargarlo; la query está parametrizada por seguridad (así se evitan inyecciones sql)
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    // Cuando la db responde, nos devuelve un array con todo. Aunque solo nos devolverá un usuario, entramos con el índex 0. nota: si no existe el user, el result.rows[0] será undefined
    const user = result.rows[0];

    // Comparamos siempre, exista o no el usuario, para evitar timing attacks.
    // Si el usuario no existe, bcrypt.compare recibe false y devuelve false.
    const passwordOk = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Generamos el JWT con el id y username. Expira en 8 horas.
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { login };

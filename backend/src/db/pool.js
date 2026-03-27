const { Pool } = require('pg');

// No le pasamos configuración porque pg lee automáticamente
// las variables de entorno PGHOST, PGPORT, PGDATABASE, PGUSER y PGPASSWORD.
// Estas variables las definimos en el docker-compose.yml.
const pool = new Pool();

module.exports = pool;

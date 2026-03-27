-- Chronos v2
-- PostgreSQL ejecuta este fichero automáticamente la primera vez que arranca el contenedor (si el volumen está vacío)

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de cronómetros
CREATE TABLE IF NOT EXISTS timers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  is_running SMALLINT DEFAULT 0, -- 0 = parado, 1 = corriendo
  started_at BIGINT, -- timestamp en ms (NULL si parado), utilizaremos Date.now() para que nos retorne la fecha desde el 1/1/1970 en ms y utc0. Luego, con new Date() obtendremos la fecha formateada
  accumulated_ms BIGINT DEFAULT 0, -- tiempo acumulado al pausar
  archived BOOLEAN DEFAULT FALSE, -- false = activo, true = histórico
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usuario inicial de prueba
-- Usuario: admin | Contraseña: admin123
-- Hash generado con bcrypt
INSERT INTO users (username, password_hash)
VALUES (
  'admin',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
)
ON CONFLICT (username) DO NOTHING;

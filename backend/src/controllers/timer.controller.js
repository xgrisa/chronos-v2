const pool = require('../db/pool');

// GET /api/timers  o  GET /api/timers?archived=true
async function getTimers(req, res) {
  const archived = req.query.archived === 'true';

  try {
    const result = await pool.query(
      'SELECT * FROM timers WHERE user_id = $1 AND archived = $2 ORDER BY created_at ASC',
      [req.user.id, archived]
    );

    // Devolvemos los timers junto con el timestamp actual del servidor.
    // El frontend usa server_now para calcular el desfase entre su reloj y el nuestro, garantizando que el cronómetro sea preciso independientemente del reloj del cliente.
    res.json({
      timers: result.rows,
      server_now: Date.now()
    });
  } catch (err) {
    console.error('Error en getTimers:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/timers
async function createTimer(req, res) {
  const { label } = req.body;

  // Controlamos que la petición venga con la label (name) del cronómetro definida
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'El nombre del cronómetro es obligatorio' });
  }

  // RETURNING * hace que PostgreSQL devuelva el registro recién insertado, así no necesitamos hacer un SELECT después del INSERT para asegurarnos de que ha funcionado
  try {
    const result = await pool.query(
      'INSERT INTO timers (user_id, label) VALUES ($1, $2) RETURNING *',
      [req.user.id, label.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error en createTimer:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/timers/:id — body: { action: 'start' | 'pause' | 'reset' | 'restore' }
async function controlTimer(req, res) {
  const { id } = req.params;
  const { action } = req.body;

  const validActions = ['start', 'pause', 'reset', 'restore'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Acción no válida' });
  }

  try {
    // Verificamos que el cronómetro existe y pertenece al usuario autenticado.
    // Sin esta comprobación, un usuario podría controlar los cronómetros de otro.
    const check = await pool.query(
      'SELECT * FROM timers WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Cronómetro no encontrado' });
    }

    const timer = check.rows[0];
    let updatedTimer;

    if (action === 'start') {
      // Guardamos el momento exacto en que arranca
      const result = await pool.query(
        'UPDATE timers SET is_running = 1, started_at = $1 WHERE id = $2 RETURNING *',
        [Date.now(), id]
      );
      updatedTimer = result.rows[0];

    } else if (action === 'pause') {
      // Calculamos el tiempo de esta sesión y lo sumamos al acumulado
      const elapsed = Date.now() - Number(timer.started_at);
      const newAccumulated = Number(timer.accumulated_ms) + elapsed;

      const result = await pool.query(
        'UPDATE timers SET is_running = 0, started_at = NULL, accumulated_ms = $1 WHERE id = $2 RETURNING *',
        [newAccumulated, id]
      );
      updatedTimer = result.rows[0];

    } else if (action === 'reset') {
      // Volvemos todo a cero
      const result = await pool.query(
        'UPDATE timers SET is_running = 0, started_at = NULL, accumulated_ms = 0 WHERE id = $1 RETURNING *',
        [id]
      );
      updatedTimer = result.rows[0];

    } else if (action === 'restore') {
      // Saca el cronómetro del histórico y lo vuelve a la lista activa
      const result = await pool.query(
        'UPDATE timers SET archived = FALSE WHERE id = $1 RETURNING *',
        [id]
      );
      updatedTimer = result.rows[0];
    }

    res.json(updatedTimer);
  } catch (err) {
    console.error('Error en controlTimer:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/timers/:id — borrado suave: archived = true
async function deleteTimer(req, res) {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'UPDATE timers SET is_running = 0, started_at = NULL, archived = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cronómetro no encontrado' });
    }

    // 204 No Content: la operación fue bien pero no hay nada que devolver
    res.status(204).send();
  } catch (err) {
    console.error('Error en deleteTimer:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { getTimers, createTimer, controlTimer, deleteTimer };

import express from 'express';
import pool from '../db/connection.js';

const router = express.Router();

// Crear usuario
router.post('/', async (req, res) => {
  const { name, email, password } = req.body;

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role_id)
     VALUES ($1, $2, $3, 1) RETURNING *`,
    [name, email, password]
  );

  res.json(result.rows[0]);
});

// Leer usuario
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );

  res.json(result.rows[0]);
});

export default router;
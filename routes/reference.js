const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// -------- TAPE PROCESS STEPS (DRYING) --------

// READ
router.get('/drying-atmospheres', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT drying_atmosphere_id, code, display, ui_order
      FROM drying_atmospheres
      WHERE is_active = true
      ORDER BY ui_order ASC, display ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки атмосфер' });
  }
});


// -------- TAPE PROCESS STEPS (MIXING) --------

// READ: dry mixing methods
router.get('/dry-mixing-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT dry_mixing_id, name, description
      FROM dry_mixing_methods
      ORDER BY dry_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки dry mixing методов' });
  }
});

// READ: wet mixing methods
router.get('/wet-mixing-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT wet_mixing_id, name, description
      FROM wet_mixing_methods
      ORDER BY wet_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки wet mixing методов' });
  }
});


// -------- TAPE PROCESS STEPS (COATING) --------

// READ
router.get('/coating-methods', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT coating_id, name, gap_um, coat_temp_c, coat_time_min, comments
      FROM coating_methods
      ORDER BY coating_id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки методов намазки' });
  }
});

// READ
router.get('/foils', async (req, res) => {
  try {

    const { rows } = await pool.query(`
      SELECT foil_id, type
      FROM foils
      ORDER BY type
    `);

    res.json(rows);

  } catch (err) {
    console.error('Error loading foils:', err);
    res.status(500).json({ error: 'Failed to load foils' });
  }
});



module.exports = router;
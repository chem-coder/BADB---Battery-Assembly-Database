const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// -------- TAPE PROCESS STEPS (DRYING) --------

// READ
router.get('/drying-atmospheres', auth, async (req, res) => {
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
router.get('/dry-mixing-methods', auth, async (req, res) => {
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
router.get('/wet-mixing-methods', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT wet_mixing_id, name, description,
             auto_min_volume_ml, auto_max_volume_ml,
             uses_balls, uses_containers
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

// READ: material families (d052) — role-scoped controlled vocabulary
// feeding the family pickers; materials.family stores the `code`.
router.get('/material-families', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT family_id, code, label, role, sort_order, notes
      FROM material_families
      ORDER BY role ASC, sort_order ASC, code ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки семейств материалов' });
  }
});

// READ: mixing containers (cups for the planetary centrifugal mixer etc.)
router.get('/mixing-containers', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT container_id, name, nominal_volume_ml, max_working_volume_ml, notes
      FROM mixing_containers
      ORDER BY sort_order ASC, container_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки ёмкостей для смешивания' });
  }
});


// -------- TAPE PROCESS STEPS (COATING) --------

// READ
router.get('/coating-methods', auth, async (req, res) => {
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
router.get('/foils', auth, async (req, res) => {
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
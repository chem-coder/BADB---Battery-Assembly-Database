const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});







module.exports = router;
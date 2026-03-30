// ═══════════════════════════════════════════════════════════════════
// Database Pool — uses config/index.js as single source of truth
// ═══════════════════════════════════════════════════════════════════
// db.js (root) is Dalia's original — hardcoded user/database.
// This module reads from config so .env overrides work.
// All NEW code should require('./db/pool') or require('./db').
// ═══════════════════════════════════════════════════════════════════
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  user:     config.db.user,
  database: config.db.database,
  // host, port, password — use pg defaults (localhost:5432, trust)
});

module.exports = pool;

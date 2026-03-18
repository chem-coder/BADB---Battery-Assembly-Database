const { Pool } = require('pg');

const pool = new Pool({
  user: 'Dalia',
  database: 'badb_v1'
});

module.exports = pool;
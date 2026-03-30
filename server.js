const app    = require('./app');
const pool   = require('./db');
const config = require('./config');

pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
});

const app    = require('./app');
const pool   = require('./db');
const config = require('./config');

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET must be set in production');
    process.exit(1);
  }
  if (process.env.AUTH_BYPASS === 'true') {
    console.error('FATAL: AUTH_BYPASS must NOT be enabled in production');
    process.exit(1);
  }
}

pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));

app.listen(config.port, config.bindHost, () => {
  const label = config.bindHost === '0.0.0.0' ? 'all interfaces' : config.bindHost;
  console.log(`Listening on ${label}:${config.port}`);
});

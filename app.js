const express        = require('express');
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');
const path           = require('path');
const errorHandler   = require('./middleware/errorHandler');
const ipAllowlist    = require('./middleware/ipAllowlist');
const registerRoutes = require('./routes/index');

const app = express();

// ── Security headers (CSP/HSTS/XFO/XCTO/...) ────────────────────────
// `contentSecurityPolicy: false` because the existing Vue SPA + PrimeVue
// inline styles would be blocked by the default CSP. Enabling CSP properly
// requires a nonce/hash strategy, which is a separate refactor.
// All other helmet defaults are active: X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, Cross-Origin-* headers, etc.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── IP allowlist (optional, controlled by ALLOWED_IPS env var) ─────
// If configured, rejects /api/* requests from IPs outside the allowlist.
// Defense against external crypto-miner probes, port scans, and any
// accidental exposure beyond the lab LAN.
// Registered BEFORE rate limit so rejected probes don't consume rate slots.
app.use('/api', ipAllowlist);

// ── Rate limiting ──────────────────────────────────────────────────
// Protects /api/* from abusive clients (e.g. a scripted dump of all tapes,
// or login-brute-force — this is defense-in-depth on top of the existing
// per-login lockout in routes/auth.js).
//
// 300 req / 1 min per IP is very permissive for a LAN lab UI but enough
// to rate-limit a runaway script. Headers are standard (RateLimit-*).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подожди минуту.' },
});
app.use('/api', apiLimiter);

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

registerRoutes(app);
app.use(errorHandler);

module.exports = app;

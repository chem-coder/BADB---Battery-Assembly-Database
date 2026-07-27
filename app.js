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

// ── Optional Vue redirects ───────────────────────────────────────────
// Vanilla HTML is the primary working app. Keep direct .html routes live
// by default; opt into Vue redirects only when explicitly requested.
const LEGACY_HTML_REDIRECTS = {
  '/index.html':                          '/',
  '/workflow/1-tapes.html':               '/tapes',
  '/workflow/2-electrodes.html':          '/electrodes',
  '/workflow/3-batteries.html':           '/assembly',
  '/workflow/4-modules.html':             '/modules',
  '/reference/materials.html':            '/reference/materials',
  '/reference/users.html':                '/reference/users',
  '/reference/projects.html':             '/reference/projects',
  '/reference/recipes.html':              '/reference/recipes',
  '/reference/separators.html':           '/reference/separators',
  '/reference/electrolytes.html':         '/reference/electrolytes',
  '/reference/separator-structures.html': '/reference/separator-structures',
  // material-details and material-source-info were split pages in the
  // legacy UI; the Vue MaterialsPage consolidates both into one.
  '/reference/material-details.html':     '/reference/materials',
  '/reference/material-source-info.html': '/reference/materials',
};
if (process.env.VUE_HTML_REDIRECTS === 'true') {
  app.use((req, res, next) => {
    const target = LEGACY_HTML_REDIRECTS[req.path];
    if (target) return res.redirect(302, target);
    next();
  });
}

// ── Front door: the built Vue app owns the root ────────────────────
// Explicit routes beat the static middlewares below, so `/` serves the
// Vue SPA even though public/index.html exists. Vanilla stays fully
// functional at /index.html (all of its internal links already point
// there explicitly), with /vanilla as the memorable alias.
app.get('/', (req, res, next) => {
  res.sendFile(path.join(__dirname, 'public-vue', 'index.html'), (err) => {
    if (err) next(); // Vue not built yet → fall through to vanilla
  });
});
app.get('/vanilla', (req, res) => res.redirect(302, '/index.html'));

app.use(express.static('public'));
// Built Vue SPA (client-web → `npm run build:web`). Served AFTER public/
// so vanilla wins remaining file conflicts (e.g. /index.html stays
// vanilla); Vue assets live under /assets/*.
app.use(express.static('public-vue'));
// Uploaded lab files are private. Serve them only through authenticated
// API download routes (e.g. GET /api/batteries/battery_electrochem/:id/download),
// never as public static files — the old `/uploads` static mount let anyone
// on the network fetch experiment files without logging in (closed for R1).

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

// ── SPA history fallback for the built Vue app ─────────────────────
// Vue Router uses createWebHistory, so direct loads/refreshes of routes
// like /tapes or /reference/projects must serve the Vue index.html.
// Only extensionless GET paths that nothing above matched land here:
// /api/* and /uploads/* are excluded, and vanilla pages are real .html
// files in public/ that the static middleware already served. If the
// build is missing (public-vue not built yet), falls through to 404.
app.get(/^\/(?!api\/|uploads\/)[^.]*$/, (req, res, next) => {
  res.sendFile(path.join(__dirname, 'public-vue', 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

module.exports = app;

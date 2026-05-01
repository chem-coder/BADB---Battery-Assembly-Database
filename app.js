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

// ── Legacy CRUD HTML redirects (Phase δ) ─────────────────────────────
// Dalia's CRUD HTML pages have been fully superseded by Vue equivalents
// (Items 1–5 + A–E + Phase γ; see the Vue parity matrix). The HTML files
// stay in the repo (no files deleted) as a rollback safety net for at
// least one quarter — but we redirect users away from them so the Vue
// SPA is the canonical path. Print pages (/workflow/*-print.html) are
// deliberately NOT in this map: Ctrl+P reporting via the legacy HTML
// is still the right tool for that job and remains the target of the
// Vue print triggers.
//
// Status 302 (temporary) so browsers don't cache the redirect. Makes
// it cheap to remove this block and have the old HTML immediately
// reachable again.
//
// Escape hatch: `LEGACY_HTML_DIRECT=true` in env disables the whole
// map. Useful when Dalia wants to test her HTML locally without the
// SPA in the way.
//
// Query strings are intentionally NOT preserved — we redirect to list
// pages. Users who had bookmarks with ?tape_id=5 etc. will land on
// the list and can find their item via the table. Smart per-param
// mapping can be added later if the usage data says it matters.
//
// Registered BEFORE express.static('public') so the redirect runs
// before the static handler would otherwise serve the HTML.
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
if (process.env.LEGACY_HTML_DIRECT !== 'true') {
  app.use((req, res, next) => {
    const target = LEGACY_HTML_REDIRECTS[req.path];
    if (target) return res.redirect(302, target);
    next();
  });
}

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

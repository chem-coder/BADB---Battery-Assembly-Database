const jwt = require('jsonwebtoken');
const config = require('../config');
const pool = require('../db/pool');

// Middleware: verify JWT token from Authorization header
// Usage: router.get('/protected', auth, handler)
// After auth: req.user = { userId, login, role }
//
// There is deliberately NO auth-bypass path here. The old dev
// AUTH_BYPASS stamped every request as the configured bypass user
// regardless of who was actually logged in, which corrupted
// created_by/updated_by attribution (removed 2026-07-29 at Dalia's
// order — do not reintroduce).
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, config.jwt.secret);

    // Fetch token_version AND active on every request. token_version check
    // revokes tokens after a password change; active check blocks an already-
    // issued token once an admin/lead deactivates the account. The two-column
    // round-trip is unavoidable for real-time deactivation — caching would
    // leave windows where a disabled user keeps working for up to TTL.
    const { rows } = await pool.query(
      'SELECT token_version, active FROM users WHERE user_id = $1',
      [decoded.userId]
    );
    if (!rows.length || rows[0].token_version !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Token revoked' });
    }
    if (rows[0].active === false) {
      return res.status(403).json({ error: 'Учётная запись отключена' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: check role
// Usage: router.get('/admin-only', auth, requireRole('admin'), handler)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { auth, requireRole };

const jwt = require('jsonwebtoken');
const config = require('../config');
const pool = require('../db/pool');

// Cache bypass user so we only query DB once
let _bypassUser = null;

async function getBypassUser() {
  if (_bypassUser) return _bypassUser;
  const bypassLogin = config.bypassLogin || 'dsmenyaylov';
  try {
    // Try configured bypass login first
    const { rows } = await pool.query(
      'SELECT user_id, login, role FROM users WHERE lower(login) = lower($1) LIMIT 1',
      [bypassLogin]
    );
    if (rows.length) {
      _bypassUser = { userId: rows[0].user_id, login: rows[0].login, role: rows[0].role };
    } else {
      // Fallback: first admin user
      const { rows: admins } = await pool.query(
        "SELECT user_id, login, role FROM users WHERE role = 'admin' ORDER BY user_id LIMIT 1"
      );
      if (admins.length) {
        _bypassUser = { userId: admins[0].user_id, login: admins[0].login, role: admins[0].role };
      } else {
        // Fallback: any user
        const { rows: any } = await pool.query('SELECT user_id, login, role FROM users ORDER BY user_id LIMIT 1');
        if (any.length) _bypassUser = { userId: any[0].user_id, login: any[0].login, role: any[0].role };
      }
    }
  } catch {
    // DB not ready yet — use hardcoded fallback
  }
  if (!_bypassUser) {
    // Don't cache hardcoded fallback — retry DB on next request
    return { userId: 1, login: bypassLogin, role: 'admin' };
  }
  return _bypassUser;
}

// Middleware: verify JWT token from Authorization header
// Usage: router.get('/protected', auth, handler)
// After auth: req.user = { userId, login, role }
async function auth(req, res, next) {
  // Dev bypass: skip JWT verification, use real DB user
  if (config.authBypass) {
    req.user = await getBypassUser();
    return next();
  }

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

-- 006_add_auth_to_dalia_db.sql
-- Apply Dima's auth system on top of Dalia's production DB schema (badb_v1).
-- Dalia's users table has only: user_id, name, active
-- We need to add auth columns + create auth_log and user_project_access.
--
-- Columns based on ACTUAL code in routes/auth.js (read line-by-line):
--   login:         used in SELECT WHERE lower(login) = lower($1)
--   password_hash: used in bcrypt.compare and UPDATE SET password_hash
--   role:          used in JWT payload, requireRole middleware
--   position:      returned in /api/auth/login and /api/auth/me responses
--
-- NOT NEEDED (not referenced in auth.js):
--   failed_attempts, locked_until — brute-force uses auth_log COUNT, not user columns
--
-- SAFE: all ALTER TABLE use IF NOT EXISTS. Safe to re-run.

-- 1. Add auth columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS login         VARCHAR(50)  UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role          VARCHAR(20)  DEFAULT 'employee'
  CHECK (role IN ('employee', 'lead', 'admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS position      VARCHAR(200);
-- Note: 'lead' matches migration 004 (renamed from 'manager')

-- 2. Auth audit log
-- BUG 1 FIX: 'password_changed' included in CHECK.
-- routes/auth.js lines 233 and 289 insert 'password_changed'.
-- Original migration 001 was missing this value → check constraint violation on password change.
CREATE TABLE IF NOT EXISTS auth_log (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(user_id),
    login      VARCHAR(50),
    event      VARCHAR(30) NOT NULL CHECK (event IN (
                   'login_success',
                   'login_failed',
                   'token_refresh',
                   'logout',
                   'register',
                   'password_changed'
               )),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details    JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_log_user    ON auth_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_log_created ON auth_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_log_event   ON auth_log(event);

-- 3. Per-project user access control
-- Used by auth.js /login and /me: SELECT project_id FROM user_project_access WHERE user_id = $1
CREATE TABLE IF NOT EXISTS user_project_access (
    user_id    INTEGER NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(user_id),
    granted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

-- 4. After running this migration, create the first admin via psql:
--    node -e "const b=require('bcryptjs'); b.hash('secret123',10).then(h=>console.log(h))"
--    psql -d badb_v1 -c "UPDATE users SET login='admin', password_hash='<hash>', role='admin' WHERE user_id=1;"

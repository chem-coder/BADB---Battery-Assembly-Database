-- 001_auth_tables.sql
-- Auth system: credentials + roles + sessions

-- Extend existing users table with auth fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS login VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'admin'));
-- Role mapping: admin = Админ, manager = Руководитель, employee = Сотрудник

-- Audit log: every login attempt, every session open
CREATE TABLE IF NOT EXISTS auth_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    login VARCHAR(50),
    event VARCHAR(30) NOT NULL CHECK (event IN ('login_success', 'login_failed', 'token_refresh', 'logout', 'register')),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_log_user ON auth_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_log_created ON auth_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_log_event ON auth_log(event);

-- Project access control
CREATE TABLE IF NOT EXISTS user_project_access (
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(user_id),
    granted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

-- 005_users_add_position.sql
-- Add position (job title) to users for display in sidebar header
-- Also normalize: login stored lowercase

ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(200);

-- Normalize existing logins to lowercase (idempotent)
UPDATE users SET login = lower(login) WHERE login != lower(login);

-- Add index for case-insensitive login lookup
CREATE INDEX IF NOT EXISTS idx_users_login_lower ON users (lower(login));

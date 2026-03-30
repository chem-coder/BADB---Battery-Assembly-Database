-- Migration 004: rename role 'manager' → 'lead'
-- Роль "Руководитель" теперь называется 'lead' вместо 'manager'
-- Date: 2026-03-17

-- 1. Снять старое CHECK-ограничение
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Переименовать существующие записи
UPDATE users SET role = 'lead' WHERE role = 'manager';

-- 3. Поставить новое CHECK-ограничение
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('employee', 'lead', 'admin'));

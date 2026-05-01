-- 018: Replace placeholder department names + correct user assignments
--
-- Migration 010 created four placeholder departments ("Отдел 1" .. "Отдел 4")
-- with a random-ish user assignment, flagged as "temporary — Dima will fix
-- from Excel at home". This migration applies the real org-chart from the
-- authoritative source "Организационная структура Дирекции по науке и
-- образованию" (PDF, rev 2026-04-16):
--
--   1: Отдел исследований и разработок ХИТ         head: Шаповалов В. (user 1)
--   2: Отдел исследований и испытаний              head: Красеньков С. (user 21)
--   3: Группа разработки новых материалов          head: Иванищев А. (user 29)
--   4: Научно-образовательная группа               head: Иванищева И. (user 32)
--
-- Department IDs are preserved (no FK churn) — only the `name` column
-- changes. head_user_id values from migration 010 already match the PDF,
-- no head reshuffling needed.
--
-- User reassignments: 15 users moved to their correct department per PDF.
-- Not touched:
--   - 14 Щербакова, 15 Зиновьев, 16 Пасечная, 18 Черных, 19 Пивовар —
--     interns listed in the PDF but without explicit department attachment;
--     retain existing placement
--   - 17 Семерухин, 23 Кочура, 24 Санников, 36 Karlson — present in DB
--     but absent from the PDF; retain existing placement pending
--     clarification
--   - 20 Чудинов (Director) — remains NULL (above all departments)
--   - 29 Иванищев, 32 Иванищева, 1 Шаповалов, 21 Красеньков — department
--     heads, already in the correct department in migration 010
--
-- Forward-only per repo invariant. Reversible only via restore from backup.

BEGIN;

-- ── 1. Department names ──────────────────────────────────────────────
UPDATE departments SET name = 'Отдел исследований и разработок ХИТ'  WHERE department_id = 1;
UPDATE departments SET name = 'Отдел исследований и испытаний'       WHERE department_id = 2;
UPDATE departments SET name = 'Группа разработки новых материалов'   WHERE department_id = 3;
UPDATE departments SET name = 'Научно-образовательная группа'        WHERE department_id = 4;

-- ── 2. User reassignments per PDF org chart ─────────────────────────

-- → Department 1 (ХИТ): 8 users moving in
--   3  Абрамова Е.   (from 3, Руководитель прикладных исследований)
--   4  Мараулайте Д. (from 4, Руководитель мониторинга и анализа)
--   5  Худышкина А.  (from 2, Руководитель фундаментальных исследований)
--   9  Бахонин А.    (from 2, Главный эксперт)
--   10 Шмелев И.     (from 2, Главный эксперт)
--   11 Баталов Р.    (from 2, Главный эксперт)
--   12 Афанасьева А. (from 3, Главный специалист 0.5)
--   13 Воропаева Д.  (from 3, Главный специалист 0.5)
UPDATE users SET department_id = 1
 WHERE user_id IN (3, 4, 5, 9, 10, 11, 12, 13);

-- → Department 2 (Отдел исследований и испытаний): 4 users moving in
--   25 Мишин Г.    (from 3, Руководитель электротехнических испытаний)
--   26 Демба Е.    (from 3, Главный специалист)
--   28 Заплавин А. (from 4, Главный специалист)
--   35 Матвеева С. (from 1, Главный специалист)
UPDATE users SET department_id = 2
 WHERE user_id IN (25, 26, 28, 35);

-- → Department 3 (Группа разработки новых материалов): 2 users moving in
--   30 Алешин С. (from 4, Главный эксперт)
--   31 Резвов С. (from 4, Главный эксперт)
UPDATE users SET department_id = 3
 WHERE user_id IN (30, 31);

-- → Department 4 (Научно-образовательная группа): 1 user moving in
--   27 Чермашенцев Г. (from 3, Главный специалист 0.5)
UPDATE users SET department_id = 4
 WHERE user_id IN (27);

-- Everything else stays put (see header comment for rationale).

COMMIT;

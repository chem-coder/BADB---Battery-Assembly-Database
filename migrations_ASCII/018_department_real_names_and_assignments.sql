-- 018: Replace placeholder department names + correct user assignments
--
-- ASCII-safe mirror of migrations/018_department_real_names_and_assignments.sql.
-- Cyrillic department names are represented with PostgreSQL Unicode escapes
-- so the resulting stored values match the main UTF-8 migration.

BEGIN;

-- 1. Department names
UPDATE departments
   SET name = U&'\041E\0442\0434\0435\043B \0438\0441\0441\043B\0435\0434\043E\0432\0430\043D\0438\0439 \0438 \0440\0430\0437\0440\0430\0431\043E\0442\043E\043A \0425\0418\0422'
 WHERE department_id = 1;

UPDATE departments
   SET name = U&'\041E\0442\0434\0435\043B \0438\0441\0441\043B\0435\0434\043E\0432\0430\043D\0438\0439 \0438 \0438\0441\043F\044B\0442\0430\043D\0438\0439'
 WHERE department_id = 2;

UPDATE departments
   SET name = U&'\0413\0440\0443\043F\043F\0430 \0440\0430\0437\0440\0430\0431\043E\0442\043A\0438 \043D\043E\0432\044B\0445 \043C\0430\0442\0435\0440\0438\0430\043B\043E\0432'
 WHERE department_id = 3;

UPDATE departments
   SET name = U&'\041D\0430\0443\0447\043D\043E-\043E\0431\0440\0430\0437\043E\0432\0430\0442\0435\043B\044C\043D\0430\044F \0433\0440\0443\043F\043F\0430'
 WHERE department_id = 4;

-- 2. User reassignments per PDF org chart
UPDATE users SET department_id = 1
 WHERE user_id IN (3, 4, 5, 9, 10, 11, 12, 13);

UPDATE users SET department_id = 2
 WHERE user_id IN (25, 26, 28, 35);

UPDATE users SET department_id = 3
 WHERE user_id IN (30, 31);

UPDATE users SET department_id = 4
 WHERE user_id IN (27);

COMMIT;

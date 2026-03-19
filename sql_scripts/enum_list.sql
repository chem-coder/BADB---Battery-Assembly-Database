-- List all enum_tables and values in the database

-- HOW TO RUN:
-- \i sql_scripts/enum_list.sql


SELECT t.typname AS enum_name,
       string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
GROUP BY t.typname
ORDER BY t.typname;
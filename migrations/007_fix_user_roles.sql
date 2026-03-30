-- Fix user roles: demote Chudinov from admin to lead
UPDATE users SET role = 'lead' WHERE login = 'evachudinov';
-- Ensure Dalia is admin
UPDATE users SET role = 'admin' WHERE login = 'dkmaraulayte';

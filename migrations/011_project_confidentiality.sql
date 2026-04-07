-- 011: Project confidentiality levels + access levels + test data
-- Enables department-based access control:
--   public       = visible to all
--   department   = visible to own department + director + admins
--   confidential = visible only to explicitly granted + director + admins

-- Confidentiality level for projects
ALTER TABLE projects ADD COLUMN confidentiality_level VARCHAR(20)
  DEFAULT 'public' CHECK (confidentiality_level IN ('public', 'department', 'confidential'));

-- Link projects to departments (owner department)
ALTER TABLE projects ADD COLUMN department_id INTEGER REFERENCES departments(department_id);

-- Access level per user-project grant
ALTER TABLE user_project_access ADD COLUMN access_level VARCHAR(20)
  DEFAULT 'view' CHECK (access_level IN ('view', 'edit', 'admin'));

-- Existing project stays public, assign to department 1
UPDATE projects SET confidentiality_level = 'public', department_id = 1 WHERE project_id = 1;

-- Test projects with different confidentiality levels
INSERT INTO projects (name, created_by, lead_id, status, confidentiality_level, department_id) VALUES
  ('Катодные материалы нового поколения', 1, 1, 'active', 'department', 1),
  ('Исследование электролитов', 21, 21, 'active', 'department', 2),
  ('Прототип твёрдотельного ЛИА', 20, 20, 'active', 'confidential', NULL),
  ('Тестирование циклирования', 29, 29, 'active', 'public', 3),
  ('Импортозамещение сепараторов', 32, 32, 'active', 'department', 4);

-- Random access grants for testing (project IDs depend on sequence)
-- Run manually after INSERT to get correct IDs:
-- SELECT project_id, name FROM projects ORDER BY project_id;
-- Then INSERT into user_project_access with correct project_ids.

BEGIN;

CREATE TABLE IF NOT EXISTS battery_projects (
  battery_id INTEGER NOT NULL REFERENCES batteries(battery_id),
  project_id INTEGER NOT NULL REFERENCES projects(project_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by INTEGER REFERENCES users(user_id),
  PRIMARY KEY (battery_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_battery_projects_project_id
  ON battery_projects(project_id);

INSERT INTO battery_projects (battery_id, project_id, created_at, created_by)
SELECT
  battery_id,
  project_id,
  COALESCE(created_at, now()),
  created_by
FROM batteries
WHERE project_id IS NOT NULL
ON CONFLICT (battery_id, project_id) DO NOTHING;

COMMIT;

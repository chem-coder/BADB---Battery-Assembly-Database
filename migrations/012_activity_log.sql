-- 012: Activity log — tracks CRUD operations across the system
-- Append-only: never UPDATE or DELETE

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  action VARCHAR(30) NOT NULL,  -- 'create', 'update', 'delete'
  entity VARCHAR(50) NOT NULL,  -- 'tape', 'electrode', 'project', 'recipe', 'user', etc.
  entity_id INTEGER,            -- PK of the affected record
  details JSONB,                -- changed fields, old/new values
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_created ON activity_log (created_at);
CREATE INDEX idx_activity_log_user ON activity_log (user_id);
CREATE INDEX idx_activity_log_entity ON activity_log (entity, entity_id);

GRANT ALL ON TABLE activity_log TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE activity_log_id_seq TO "Dalia";

-- Seed with a few test entries
INSERT INTO activity_log (user_id, action, entity, entity_id, details) VALUES
  (4, 'create', 'tape', 1, '{"name": "TEST Cathode 1: NMC C85E"}'),
  (4, 'create', 'tape', 2, '{"name": "TEST Cathode 2: LFP S19"}'),
  (4, 'update', 'tape', 1, '{"field": "status", "old": "draft", "new": "active"}'),
  (34, 'create', 'project', 1, '{"name": "TEST Проект 1"}'),
  (20, 'create', 'project', 5, '{"name": "Прототип твёрдотельного ЛИА", "confidentiality": "confidential"}'),
  (1, 'update', 'user', 14, '{"field": "department_id", "old": null, "new": 1}');

-- Feedback system — colleagues can submit text, photos, audio, files
-- with category (bug, feature, improvement, question)

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id serial PRIMARY KEY,
  user_id integer REFERENCES users(user_id),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'feature', 'improvement', 'question', 'other')),
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by integer REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS feedback_attachments (
  attachment_id serial PRIMARY KEY,
  feedback_id integer NOT NULL REFERENCES feedback(feedback_id) ON DELETE CASCADE,
  filename text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  data bytea NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

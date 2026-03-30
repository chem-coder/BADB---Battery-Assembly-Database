-- 002_raw_submissions.sql
-- Append-only audit table for all incoming data packages

CREATE TABLE IF NOT EXISTS raw_submissions (
    id SERIAL PRIMARY KEY,
    submission_id VARCHAR(30) NOT NULL,
    submission_type VARCHAR(50) NOT NULL,
    contract_version VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    checksum VARCHAR(64),
    submitted_by INTEGER REFERENCES users(user_id),
    source VARCHAR(20) DEFAULT 'excel' CHECK (source IN ('excel', 'web', 'api', 'import')),
    status VARCHAR(20) DEFAULT 'accepted' CHECK (status IN ('accepted', 'rejected', 'processing', 'processed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(submission_id, checksum)
);

CREATE INDEX IF NOT EXISTS idx_raw_submissions_type ON raw_submissions(submission_type);
CREATE INDEX IF NOT EXISTS idx_raw_submissions_created ON raw_submissions(created_at);

ALTER TABLE sessions ADD COLUMN token_hash TEXT;
ALTER TABLE sessions ADD COLUMN expira_en DATETIME;

CREATE UNIQUE INDEX idx_sessions_token_hash
    ON sessions(token_hash);

CREATE INDEX idx_sessions_expira_en
    ON sessions(expira_en);
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  username   TEXT,
  action     TEXT        NOT NULL,   -- upload / delete / lock / unlock / share / view / ...
  file_id    INTEGER,
  filename   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
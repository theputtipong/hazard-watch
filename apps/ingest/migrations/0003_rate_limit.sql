-- Fixed-window request counter per hashed client IP and action; old windows are pruned by the push cron.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,              -- "<action>:<sha-256 of ip>"
  window_start INTEGER NOT NULL,     -- unix seconds
  hits INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,               -- sha-256 of the endpoint
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'th',
  district TEXT NOT NULL,            -- alerts are evaluated per district
  subdistrict TEXT,                  -- display only
  prefs TEXT NOT NULL DEFAULT '{}',  -- {"kinds":["flood",...],"pm25At":37.5}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_district ON subscriptions (district);

-- Suppresses repeat alerts within the push cooldown.
CREATE TABLE IF NOT EXISTS sent (
  subscription_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (subscription_id, alert_key)
);

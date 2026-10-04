-- Web Push subscriptions. Only the area (district/subdistrict codes) is stored, never coordinates.
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,               -- sha-256 of the endpoint
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'th',
  district TEXT NOT NULL,            -- e.g. TH1028 (alerts are evaluated per district)
  subdistrict TEXT,                  -- e.g. TH102803 (for display only)
  prefs TEXT NOT NULL DEFAULT '{}',  -- {"kinds":["flood",...],"pm25At":37.5}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_district ON subscriptions (district);

-- What was sent to whom, to suppress repeats within the cooldown.
CREATE TABLE IF NOT EXISTS sent (
  subscription_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (subscription_id, alert_key)
);

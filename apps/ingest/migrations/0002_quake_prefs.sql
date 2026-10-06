-- NULL = central quake tiers; only values from core config `push.quakeChoices` are stored.
ALTER TABLE subscriptions ADD COLUMN quake_min_mag REAL;   -- magnitude
ALTER TABLE subscriptions ADD COLUMN quake_max_km REAL;    -- km from the district centre

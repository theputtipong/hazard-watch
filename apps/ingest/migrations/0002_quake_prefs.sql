-- Personal earthquake alert level. NULL = the central quake tiers (packages/core/src/config.ts `quake.tiers`).
-- Only values from core config `push.quakeChoices` are stored (checked by the API and again when sending).
ALTER TABLE subscriptions ADD COLUMN quake_min_mag REAL;   -- e.g. 5, 6, 7 (magnitude)
ALTER TABLE subscriptions ADD COLUMN quake_max_km REAL;    -- e.g. 500, 1000, 1500 (km from the district centre)

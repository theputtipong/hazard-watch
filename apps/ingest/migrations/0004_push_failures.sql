-- Consecutive failed deliveries; the row is deleted once it reaches the strike limit.
ALTER TABLE subscriptions ADD COLUMN failures INTEGER NOT NULL DEFAULT 0;

-- Spotify no longer reports ad traffic in "Other"; drop the unused metric.
ALTER TABLE daily_data DROP COLUMN IF EXISTS other_pct;

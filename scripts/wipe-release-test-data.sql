-- Wipe all release test data (fresh slate for weekday-aware curve).
-- Run in Supabase SQL Editor. Do NOT touch schema, migrations, or auth.users.
-- Hold COMMIT until Klaus approves the post-delete counts.

BEGIN;

-- ========== PRE-WIPE COUNTS ==========
SELECT 'daily_data' AS table_name, count(*)::bigint AS row_count FROM daily_data
UNION ALL
SELECT 'releases', count(*)::bigint FROM releases;

-- Optional inventory (review before delete)
SELECT id, track_name, artist_name, status, release_date
FROM releases
ORDER BY release_date DESC NULLS LAST, created_at DESC;

-- ========== DELETE (FK order: children first) ==========
DELETE FROM daily_data;
DELETE FROM releases;

-- ========== POST-WIPE COUNTS (expect 0 / 0) ==========
SELECT 'daily_data' AS table_name, count(*)::bigint AS row_count FROM daily_data
UNION ALL
SELECT 'releases', count(*)::bigint FROM releases;

-- ROLLBACK;   -- default until review
-- COMMIT;     -- only after Klaus confirms both counts are 0

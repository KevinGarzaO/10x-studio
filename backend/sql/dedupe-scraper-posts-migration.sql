-- ============================================
-- Step 1 of 4: dedupe scraper_posts entirely in SQL (no client-side
-- pagination — that's how ~20k rows escaped the earlier cleanup script).
-- Run this FIRST in the Supabase SQL Editor, before dedupe-constraint-migration.sql.
--
-- Real column names on scraper_posts are platform/source/post_id
-- (not external_id) — see backend/sql/scraper-migration.sql.
-- ============================================

DELETE FROM scraper_posts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY platform, source, post_id
             ORDER BY created_at ASC
           ) AS rn
    FROM scraper_posts
  ) t
  WHERE rn > 1
);

-- Sanity check: should return 0 rows.
SELECT platform, source, post_id, COUNT(*)
FROM scraper_posts
GROUP BY platform, source, post_id
HAVING COUNT(*) > 1;

-- ============================================
-- Step 2 of 4: prevents duplicate scraped job postings at the DB level.
-- Run this AFTER dedupe-scraper-posts-migration.sql (step 1) — this will
-- fail to apply while any duplicate rows still exist.
-- ============================================

ALTER TABLE scraper_posts
  ADD CONSTRAINT scraper_posts_unique_post UNIQUE (platform, source, post_id);

-- Postgres treats every NULL as distinct, so this only enforces uniqueness
-- among rows that actually have a source_url (i.e. scraped ATS jobs) —
-- native community posts (source_url IS NULL) are unaffected.
ALTER TABLE community_posts
  ADD CONSTRAINT community_posts_unique_source_url UNIQUE (source_url);

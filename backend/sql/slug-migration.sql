-- ============================================
-- SEO-friendly slugs for community_posts
-- Run this in Supabase SQL Editor
-- ============================================

-- Add slug columns
ALTER TABLE community_posts 
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS slug_history JSONB DEFAULT '[]'::jsonb;

-- Unique index on slug (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_posts_slug 
ON community_posts(slug) WHERE slug IS NOT NULL;

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_community_posts_slug_lookup 
ON community_posts(slug) WHERE slug IS NOT NULL;

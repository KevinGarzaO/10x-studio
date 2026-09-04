-- ============================================
-- Scraper Integration - Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add columns to existing users table for scraped profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS years_experience INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rate TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_links TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_modality TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_scraper_profile BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS scraper_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS original_url TEXT;

-- 2. Add columns to community_posts for scraped vacancies
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS original_text TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS contacts JSONB;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_scraper_post BOOLEAN DEFAULT FALSE;

-- 3. Scraper Sources table (channels, subforums, subreddits discovered)
CREATE TABLE IF NOT EXISTS scraper_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  source_id TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT false,
  quality_score NUMERIC(5,2),
  categories TEXT[],
  contact_quality TEXT,
  total_posts_tested INTEGER,
  posts_with_contact INTEGER,
  last_tested_at TIMESTAMPTZ,
  last_post_date TIMESTAMPTZ,
  discovered_by TEXT DEFAULT 'discovery',
  discovery_query TEXT,
  rejection_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, source_id)
);

-- 4. Scraper Posts table (raw scraped data)
CREATE TABLE IF NOT EXISTS scraper_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  source TEXT NOT NULL,
  post_id TEXT,
  url TEXT,
  post_date TIMESTAMPTZ,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  author TEXT,
  views TEXT,
  text TEXT NOT NULL,
  language TEXT,
  post_type TEXT,
  location TEXT,
  work_modality TEXT,
  profile JSONB,
  contacts JSONB NOT NULL,
  quality_score NUMERIC(5,2),
  summary TEXT,
  is_spam BOOLEAN DEFAULT false,
  search_profile TEXT,
  forum_hint TEXT,
  synced_to_community BOOLEAN DEFAULT false,
  community_post_id UUID REFERENCES community_posts(id),
  synced_to_user BOOLEAN DEFAULT false,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Scraper Runs table (execution logs)
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  search_profile TEXT,
  sources_tested INTEGER,
  sources_promoted INTEGER,
  sources_rejected INTEGER,
  posts_found INTEGER,
  posts_with_contact INTEGER,
  posts_inserted INTEGER,
  new_channels_discovered INTEGER,
  duration_ms INTEGER,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- 6. System user for scraper bot
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'bot@avocado-studio.com',
  '',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, username, display_name, bio, is_scraper_profile)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'bot@avocado-studio.com',
  'avocado-jobs-bot',
  'Avocado Jobs Bot',
  'Bot automatizado que encuentra vacantes y perfiles de empleo en LatAm',
  false
) ON CONFLICT (id) DO NOTHING;

-- 7. Indexes for scraper tables
CREATE INDEX IF NOT EXISTS idx_scraper_posts_platform_source ON scraper_posts(platform, source);
CREATE INDEX IF NOT EXISTS idx_scraper_posts_post_type ON scraper_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_scraper_posts_post_date ON scraper_posts(post_date DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_posts_search_profile ON scraper_posts(search_profile);
CREATE INDEX IF NOT EXISTS idx_scraper_posts_synced ON scraper_posts(synced_to_community, synced_to_user);
CREATE INDEX IF NOT EXISTS idx_scraper_sources_platform ON scraper_sources(platform);
CREATE INDEX IF NOT EXISTS idx_scraper_sources_active ON scraper_sources(is_active);

-- 8. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_is_scraper_profile ON users(is_scraper_profile);
CREATE INDEX IF NOT EXISTS idx_community_posts_is_scraper ON community_posts(is_scraper_post);
CREATE INDEX IF NOT EXISTS idx_community_posts_platform ON community_posts(platform);

-- 9. Enable RLS
ALTER TABLE scraper_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies (service role = full access)
CREATE POLICY "Service role full access" ON scraper_sources FOR ALL USING (true);
CREATE POLICY "Service role full access" ON scraper_posts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON scraper_runs FOR ALL USING (true);

-- Public read for scraper sources (to show in community hub)
CREATE POLICY "Public read scraper sources" ON scraper_sources FOR SELECT USING (true);
CREATE POLICY "Public read scraper posts" ON scraper_posts FOR SELECT USING (true);

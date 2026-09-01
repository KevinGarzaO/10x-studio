-- ============================================
-- Community Hub - Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add missing columns to existing users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS github_url TEXT;

-- Add unique constraints only if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Community tables (with community_ prefix to avoid conflicts)

-- Community Posts
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('editorial', 'job', 'discussion', 'showcase')),
  budget TEXT,
  modalidad TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  votes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community Tags
CREATE TABLE IF NOT EXISTS community_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- Community Post-Tags (many-to-many)
CREATE TABLE IF NOT EXISTS community_post_tags (
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES community_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Community Comments
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community Votes
CREATE TABLE IF NOT EXISTS community_votes (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

-- Community Saved Posts
CREATE TABLE IF NOT EXISTS community_saved_posts (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- Community Notifications
CREATE TABLE IF NOT EXISTS community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_type ON community_posts(type);
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_user ON community_notifications(user_id, read);

-- 4. Enable RLS
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Read policies (public)
CREATE POLICY "Community public posts" ON community_posts FOR SELECT USING (true);
CREATE POLICY "Community public tags" ON community_tags FOR SELECT USING (true);
CREATE POLICY "Community public post_tags" ON community_post_tags FOR SELECT USING (true);
CREATE POLICY "Community public comments" ON community_comments FOR SELECT USING (true);
CREATE POLICY "Community view votes" ON community_votes FOR SELECT USING (true);

-- Write policies (owner only)
CREATE POLICY "Users can create community posts" ON community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can update own community posts" ON community_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Users can delete own community posts" ON community_posts FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Users can create community comments" ON community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can delete own community comments" ON community_comments FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Users can vote community" ON community_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unvote community" ON community_votes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can save community posts" ON community_saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave community posts" ON community_saved_posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own community saved" ON community_saved_posts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own community notifications" ON community_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark own community notifications" ON community_notifications FOR UPDATE USING (auth.uid() = user_id);

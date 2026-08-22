-- Content table for unified content storage
CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  excerpt TEXT,
  markdown_content TEXT,
  html_content TEXT,
  image_url TEXT,
  image_prompt TEXT,
  
  -- Classification
  content_type TEXT NOT NULL DEFAULT 'blog_post',  -- blog_post, newsletter, linkedin_post, note
  source TEXT NOT NULL DEFAULT 'ai_generated',      -- ai_generated, user_created, migrated
  destination TEXT NOT NULL DEFAULT 'web',           -- substack, web, wordpress, linkedin
  
  -- Metadata
  topic_id UUID,
  user_id UUID,
  word_count INTEGER,
  tone TEXT,
  length_target TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft',   -- draft, published, scheduled, failed
  published_at TIMESTAMPTZ,
  external_id TEXT,              -- Substack draft_id, LinkedIn post_id
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for content
CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_destination ON content(destination);
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_user ON content(user_id);
CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at DESC);

-- Post analytics table
CREATE TABLE IF NOT EXISTS post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- substack, web, linkedin
  
  -- Metrics
  views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  subscriptions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  
  -- Timestamps
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_post_analytics_content ON post_analytics(content_id);
CREATE INDEX IF NOT EXISTS idx_post_analytics_date ON post_analytics(recorded_at DESC);

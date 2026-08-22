const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://qqqkjneuzalfcerjzzae.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxcWtqbmV1emFsZmNlcmp6emFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMDkxNzQsImV4cCI6MjA4ODY4NTE3NH0.UgosKnFgtPLsmZw-YQ8nEmkXUUCuUKrTlUadWD1bHxg')

async function execSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.log('ERROR:', error.message)
    return false
  }
  return true
}

async function main() {
  // 1. Create content table
  console.log('Creating content table...')
  const contentSQL = `
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
  content_type TEXT NOT NULL DEFAULT 'blog_post',
  source TEXT NOT NULL DEFAULT 'ai_generated',
  destination TEXT NOT NULL DEFAULT 'web',
  topic_id UUID,
  user_id UUID,
  word_count INTEGER,
  tone TEXT,
  length_target TEXT,
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`
  await execSQL(contentSQL)

  // 2. Create post_analytics table
  console.log('Creating post_analytics table...')
  const analyticsSQL = `
CREATE TABLE IF NOT EXISTS post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  subscriptions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);`
  await execSQL(analyticsSQL)

  // 3. Create indexes
  console.log('Creating indexes...')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_content_destination ON content(destination);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_content_user ON content(user_id);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at DESC);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_post_analytics_content ON post_analytics(content_id);')
  await execSQL('CREATE INDEX IF NOT EXISTS idx_post_analytics_date ON post_analytics(recorded_at DESC);')

  console.log('Done!')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

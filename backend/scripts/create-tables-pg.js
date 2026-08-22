const { Client } = require('pg')

const client = new Client({
  host: 'db.qqqkjneuzalfcerjzzae.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'OhCGvfonCrXGVoj4',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
})

async function main() {
  console.log('Connecting to PostgreSQL...')
  await client.connect()
  console.log('Connected!\n')

  // 1. Create content table
  console.log('Creating content table...')
  await client.query(`
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
    );
  `)
  console.log('  content table OK')

  // 2. Create post_analytics table
  console.log('Creating post_analytics table...')
  await client.query(`
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
    );
  `)
  console.log('  post_analytics table OK')

  // 3. Create indexes
  console.log('Creating indexes...')
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);',
    'CREATE INDEX IF NOT EXISTS idx_content_destination ON content(destination);',
    'CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);',
    'CREATE INDEX IF NOT EXISTS idx_content_user ON content(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_post_analytics_content ON post_analytics(content_id);',
    'CREATE INDEX IF NOT EXISTS idx_post_analytics_date ON post_analytics(recorded_at DESC);'
  ]
  for (const sql of indexes) {
    await client.query(sql)
  }
  console.log('  indexes OK')

  // 4. Verify
  console.log('\nVerifying...')
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('content', 'post_analytics')")
  console.log('Tables:', res.rows.map(r => r.table_name).join(', '))

  await client.end()
  console.log('\nDone!')
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })

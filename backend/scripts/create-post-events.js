const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:OhCGvfonCrXGVoj4@db.qqqkjneuzalfcerjzzae.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS post_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_id UUID REFERENCES content(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      page_url TEXT,
      user_agent TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_post_events_content ON post_events(content_id);
    CREATE INDEX IF NOT EXISTS idx_post_events_type ON post_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_post_events_date ON post_events(recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_post_events_visitor ON post_events(visitor_id);

    ALTER TABLE post_events ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Allow public inserts" ON post_events FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Allow public reads" ON post_events FOR SELECT TO anon USING (true);
  `);

  console.log('post_events table created successfully');
  await client.end();
})();

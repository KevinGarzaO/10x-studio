const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:OhCGvfonCrXGVoj4@db.qqqkjneuzalfcerjzzae.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  await client.query(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS signups INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS open_rate DECIMAL(5,4) DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS reaction_count INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'newsletter';
  `);

  console.log('posts table updated with stats columns');
  await client.end();
})();

const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:OhCGvfonCrXGVoj4@db.qqqkjneuzalfcerjzzae.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  await client.query(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
  `);

  console.log('likes column added');
  await client.end();
})();

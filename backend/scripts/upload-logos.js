require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

(async () => {
  // 1. Create bucket
  const { error: bucketErr } = await supabase.storage.createBucket('company-logos', {
    public: true,
    fileSizeLimit: 102400,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'],
  });
  if (bucketErr && !bucketErr.message?.includes('already exists')) {
    console.log('Bucket error:', bucketErr.message);
    return;
  }
  console.log('Bucket company-logos ready');

  // 2. Get all sources with logo_url in metadata
  const { data: sources } = await supabase
    .from('scraper_sources')
    .select('id, source_id, platform, metadata')
    .not('metadata', 'is', null);

  const withLogo = (sources || []).filter(s => s.metadata?.logo_url);
  console.log(`Found ${withLogo.length} sources with logo_url`);

  let uploaded = 0;
  let failed = 0;

  for (const source of withLogo) {
    const logoUrl = source.metadata.logo_url;
    const fileName = `${source.platform}_${source.source_id}.png`;

    // Download from Google Favicon
    const buffer = await fetchImage(logoUrl);
    if (!buffer || buffer.length === 0) {
      failed++;
      continue;
    }

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from('company-logos')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadErr) {
      console.log(`✗ ${source.source_id} — ${uploadErr.message}`);
      failed++;
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('company-logos')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update metadata with storage URL
    const newMetadata = { ...source.metadata, storage_logo_url: publicUrl };
    await supabase
      .from('scraper_sources')
      .update({ metadata: newMetadata })
      .eq('id', source.id);

    uploaded++;
    if (uploaded % 10 === 0) console.log(`  Uploaded ${uploaded}/${withLogo.length}...`);
  }

  console.log(`\n=== Done: ${uploaded} uploaded, ${failed} failed ===`);
})();

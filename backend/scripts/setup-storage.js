const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://qqqkjneuzalfcerjzzae.supabase.co', process.env.SUPABASE_SERVICE_KEY || 'TU_SERVICE_KEY')

async function main() {
  // 1. List existing buckets
  console.log('Checking existing buckets...')
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
  if (listErr) {
    console.log('Error listing buckets:', listErr.message)
  } else {
    console.log('Existing buckets:', buckets.map(b => b.name).join(', ') || 'none')
  }

  // 2. Create 'images' bucket if it doesn't exist
  const exists = buckets?.some(b => b.name === 'images')
  if (!exists) {
    console.log('\nCreating "images" bucket...')
    const { error: createErr } = await supabase.storage.createBucket('images', {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    })
    if (createErr) {
      console.log('Error creating bucket:', createErr.message)
    } else {
      console.log('Bucket "images" created successfully!')
    }
  } else {
    console.log('\nBucket "images" already exists.')
  }

  // 3. Test upload
  console.log('\nTesting upload...')
  const testBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  const { error: uploadErr } = await supabase.storage
    .from('images')
    .upload('test/test.png', testBuffer, { contentType: 'image/png' })
  
  if (uploadErr) {
    console.log('Upload error:', uploadErr.message)
  } else {
    console.log('Test upload successful!')
    const { data: urlData } = supabase.storage.from('images').getPublicUrl('test/test.png')
    console.log('Public URL:', urlData.publicUrl)
    await supabase.storage.from('images').remove(['test/test.png'])
    console.log('Test file cleaned up')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

const admin = require('firebase-admin')
const { createClient } = require('@supabase/supabase-js')
const https = require('https')
const http = require('http')

// Firebase
const serviceAccount = require('../../babelink-ia-firebase-adminsdk-fme0i-75c11a351d.json')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// Supabase - usa variable de entorno o hardcode solo para scripts one-time
const supabase = createClient('https://qqqkjneuzalfcerjzzae.supabase.co', process.env.SUPABASE_SERVICE_KEY || 'TU_SERVICE_KEY')

function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function timestampToISO(ts) {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000).toISOString()
  return null
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  console.log('=== Firebase to Supabase Migration ===\n')

  // 1. Get all entries from Firebase
  console.log('Fetching entries from Firebase...')
  const snapshot = await db.collection('entradas').get()
  console.log(`Found ${snapshot.size} entries\n`)

  let migrated = 0
  let imagesUploaded = 0
  let errors = 0

  // 2. Migrate each entry
  for (const doc of snapshot.docs) {
    const data = doc.data()
    
    try {
      const slug = generateSlug(data.title || doc.id)
      
      // 2a. Download and upload image if exists
      let imageUrl = data.image || null
      if (imageUrl && imageUrl.startsWith('http')) {
        try {
          console.log(`  Downloading image for: ${data.title?.substring(0, 40)}...`)
          const imageBuffer = await downloadImage(imageUrl)
          
          // Determine content type
          const ext = imageUrl.includes('.png') ? '.png' : '.jpg'
          const fileName = `migrated/${slug}${ext}`
          const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'
          
          // Upload to Supabase Storage
          const { error: uploadErr } = await supabase.storage
            .from('images')
            .upload(fileName, imageBuffer, { contentType, upsert: true })
          
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName)
            imageUrl = urlData.publicUrl
            imagesUploaded++
          } else {
            console.log(`    Upload error: ${uploadErr.message}`)
          }
        } catch (imgErr) {
          console.log(`    Image download error: ${imgErr.message}`)
        }
      }

      // 2b. Insert content
      const content = {
        slug,
        title: data.title || 'Sin titulo',
        subtitle: data.subtitle || '',
        excerpt: data.excerpt || '',
        markdown_content: data.markdownContent || '',
        html_content: '',
        image_url: imageUrl,
        image_prompt: '',
        content_type: 'blog_post',
        source: 'migrated',
        destination: 'web',
        user_id: '1fb331cc-e0df-4a77-accf-7c4ebe11dfd8',
        word_count: (data.markdownContent || '').split(/\s+/).length,
        status: 'published',
        published_at: timestampToISO(data.date),
        external_id: doc.id,
        created_at: timestampToISO(data.updatedAt) || new Date().toISOString(),
        updated_at: timestampToISO(data.updatedAt) || new Date().toISOString()
      }

      const { error } = await supabase.from('content').upsert(content, { onConflict: 'slug' })

      if (error) {
        console.log(`  Error: ${data.title?.substring(0, 30)} - ${error.message}`)
        errors++
      } else {
        migrated++
        if (migrated % 10 === 0) {
          console.log(`  Progress: ${migrated}/${snapshot.size} migrated, ${imagesUploaded} images`)
        }
      }
    } catch (e) {
      console.log(`  Error processing ${doc.id}: ${e.message}`)
      errors++
    }
  }

  console.log('\n=== Migration Complete ===')
  console.log(`Total entries: ${snapshot.size}`)
  console.log(`Migrated: ${migrated}`)
  console.log(`Images uploaded: ${imagesUploaded}`)
  console.log(`Errors: ${errors}`)
}

main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1) })

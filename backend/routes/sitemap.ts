import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.service'

const router = Router()
const SITE_URL = process.env.SITE_URL || 'https://avotalent.io'

router.get('/sitemap.xml', async (_req: Request, res: Response) => {
  try {
    const urls: string[] = []

    // Static pages
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/jobs', priority: '0.9', changefreq: 'daily' },
      { path: '/community', priority: '0.8', changefreq: 'daily' },
      { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
      { path: '/terms', priority: '0.3', changefreq: 'monthly' },
    ]

    for (const page of staticPages) {
      urls.push(`  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`)
    }

    // Dynamic job posts
    const { data: posts } = await supabase
      .from('community_posts')
      .select('id, created_at')
      .eq('type', 'job')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (posts) {
      for (const post of posts) {
        urls.push(`  <url>
    <loc>${SITE_URL}/post/${post.id}</loc>
    <lastmod>${new Date(post.created_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)
      }
    }

    // Dynamic user profiles (public)
    const { data: users } = await supabase
      .from('users')
      .select('id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10000)

    if (users) {
      for (const user of users) {
        urls.push(`  <url>
    <loc>${SITE_URL}/profile/${user.id}</loc>
    <lastmod>${new Date(user.updated_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`)
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

    res.setHeader('Content-Type', 'application/xml')
    res.send(xml)
  } catch (error) {
    console.error('Sitemap error:', error)
    res.status(500).send('Error generating sitemap')
  }
})

export default router

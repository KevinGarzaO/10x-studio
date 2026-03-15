import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader, substackHeaders } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await db.substack.user.get()
    if (!user) return NextResponse.json({ error: 'No se encontró usuario' }, { status: 404 })

    const postsInDb = await db.substack.posts.getAll(user.id)
    
    const { searchParams } = new URL(req.url)
    const refresh = searchParams.get('refresh') === 'true'

    if (postsInDb.length > 0 && !refresh) {
      return NextResponse.json(postsInDb)
    }

    // Refresh from Substack
    const cookie = await buildCookieHeader()
    if (!cookie) return NextResponse.json({ error: 'No hay cookies' }, { status: 401 })

    const pubSlug = user.subdomain
    if (!pubSlug) return NextResponse.json({ error: 'No se encontró slug de publicación' }, { status: 400 })

    const url = `https://${pubSlug}.substack.com/api/v1/post_management/published?offset=0&limit=100&order_by=post_date&order_direction=desc`
    const res = await fetch(url, { headers: substackHeaders(cookie, pubSlug) })

    if (!res.ok) {
      console.error(`Substack API error (posts): ${res.status}`)
      return NextResponse.json(postsInDb) // Return stale data
    }

    const substackPosts = await res.json()
    console.log(`[Posts Sync] Fetched ${substackPosts.length || 0} posts from Substack API.`);
    
    // Ensure we have an array
    const postsArray = Array.isArray(substackPosts) 
      ? substackPosts 
      : (substackPosts?.posts && Array.isArray(substackPosts.posts))
        ? substackPosts.posts
        : []

    if (postsArray.length === 0 && !Array.isArray(substackPosts)) {
      console.warn('Substack API returned non-array:', substackPosts)
      return NextResponse.json(postsInDb)
    }

    // Map and save to Supabase
    const postsToUpsert = postsArray.map((p: any) => ({
      user_id: user.id,
      post_id: String(p.id),
      title: p.title,
      subtitle: p.subtitle,
      cover_image_url: p.cover_image,
      published_at: p.post_date,
      audience: p.audience || 'everyone',
      is_published: true,
      synced_at: new Date().toISOString()
    }))

    if (postsToUpsert.length > 0) {
      await db.substack.posts.upsertMany(postsToUpsert)
    }

    return NextResponse.json(postsToUpsert)
  } catch (error) {
    console.error('Posts API Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

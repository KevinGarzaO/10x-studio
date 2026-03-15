import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader, substackHeaders } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await db.substack.user.get()
    if (!user) {
      return NextResponse.json({ error: 'No se encontró usuario de Substack vinculado' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const refresh = searchParams.get('refresh') === 'true'

    // Retorna datos en caché a menos que el usuario pida refrescar y exista ID válido
    if (!refresh && user.substack_user_id) {
      return NextResponse.json(user)
    }

    // Refresh from Substack
    const cookie = await buildCookieHeader()
    if (!cookie) return NextResponse.json({ error: 'No hay cookies de Substack' }, { status: 401 })

    // Use self profile endpoint
    const url = `https://substack.com/api/v1/user/${user.substack_slug}/public_profile/self`
    const res = await fetch(url, {
      headers: substackHeaders(cookie)
    })

    if (!res.ok) {
      // If refresh fails but we have data, return stale data as fallback
      console.error(`Substack API error: ${res.status}`)
      return NextResponse.json(user)
    }

    const profile = await res.json()
    
    // Update Supabase
    const updatedUser = await db.substack.user.upsert({
      id: user.id,
      name: profile.name || profile.display_name || user.name,
      photo_url: profile.photo_url || profile.profile_photo_url || user.photo_url,
      bio: profile.bio || user.bio,
      publication_id: String(profile.primaryPublication?.id || user.publication_id),
      subdomain: profile.primaryPublication?.subdomain || user.subdomain,
      subscriber_count: profile.primaryPublication?.subscriber_count || user.subscriber_count,
      updated_at: new Date().toISOString()
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Profile API Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

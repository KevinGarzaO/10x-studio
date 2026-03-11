import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader as buildHeader } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const allowed = origin.startsWith('chrome-extension://') || origin.includes('localhost')
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

function buildCookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function POST(req: NextRequest) {
  const { cookies, profileVerified, profile, autoSubscribe } = await req.json()

  if (!cookies || Object.keys(cookies).length === 0)
    return NextResponse.json({ error: 'No se recibieron cookies' }, { status: 400, headers: corsHeaders(req) })

  const cookieHeader = buildCookieString(cookies)
  let finalName        = ''
  let finalAvatar      = ''
  let finalSubCount    = 0
  let finalSubdomain   = ''
  let finalBio         = ''
  let finalHandle      = ''
  let finalFollowers   = 0
  let verified         = profileVerified || false
  let substackUserId   = profile?.pubId || profile?.primaryPublication?.id || ''

  if (profileVerified && profile) {
    finalName        = profile?.name || profile?.display_name || ''
    finalAvatar      = profile?.photo_url || profile?.profile_photo_url || ''
    finalSubCount    = profile?.primaryPublication?.subscriber_count || 0
    finalSubdomain   = profile?.primaryPublication?.subdomain || ''
    finalBio         = profile?.bio || ''
    finalHandle      = profile?.handle || ''
    finalFollowers   = profile?.followerCount || 0
    verified         = true
  } else {
    try {
      const meRes = await fetch('https://substack.com/api/v1/subscriber/me', {
        headers: {
          'Cookie':     cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':     'application/json',
          'Referer':    'https://substack.com/',
        }
      })

      if (meRes.ok) {
        const me         = await meRes.json()
        finalName        = me?.name || me?.display_name || ''
        finalAvatar      = me?.photo_url || me?.profile_photo_url || ''
        finalSubCount    = me?.primaryPublication?.subscriber_count || 0
        finalSubdomain   = me?.primaryPublication?.subdomain || ''
        substackUserId   = String(me?.primaryPublication?.id || 0)
        verified         = true
      } else {
        return NextResponse.json({
          error: `Substack rechazó las cookies (${meRes.status}). Cierra sesión en substack.com, vuelve a entrar y reconecta.`
        }, { status: 401, headers: corsHeaders(req) })
      }
    } catch (e) {
      return NextResponse.json(
        { error: `No se pudo verificar con Substack: ${String(e)}` },
        { status: 500, headers: corsHeaders(req) }
      )
    }
  }

  // Save to relational tables
  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString()
  
  try {
    const userData: any = {
      substack_user_id: String(substackUserId),
      substack_slug: finalHandle || finalSubdomain,
      name: finalName,
      handle: finalHandle,
      photo_url: finalAvatar,
      bio: finalBio,
      publication_id: String(substackUserId),
      subdomain: finalSubdomain,
      subscriber_count: finalSubCount,
      updated_at: new Date().toISOString()
    }

    let user = await db.substack.user.get(userData.substack_user_id)
    if (user) userData.id = user.id
    user = await db.substack.user.upsert(userData)

    await db.substack.cookies.upsert({
      user_id: user.id,
      substack_sid: cookies['substack.sid'] || cookies['connect.sid'] || '',
      substack_lli: cookies['substack.lli'] || '',
      visit_id: cookies['visit_id'] || '',
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    })

    // Also update legacy settings for some components that still read it
    const settings = await db.settings.get()
    await db.settings.save({
      ...settings,
      substackCookie: cookies['substack.sid'] || cookies['connect.sid'] || '',
      substackPublication: finalSubdomain,
      substackProfile: {
        pubId: substackUserId,
        subdomain: finalSubdomain,
        name: finalName,
        handle: finalHandle,
        avatar: finalAvatar,
      }
    } as any)

    // Feature 1: Auto-subscription
    if (autoSubscribe && user.subdomain && (profile?.email || profile?.user?.email)) {
      try {
        await fetch(`${req.nextUrl.origin}/api/substack/subscribers/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: (profile?.email || profile?.user?.email) })
        })
      } catch (e) {
        console.error('Auto-subscribe error:', e)
      }
    }

  } catch (dbError: any) {
    console.error('Error saving to Supabase:', dbError)
    const msg = dbError.message || dbError.details || 'Error desconocido'
    return NextResponse.json({ error: `Error al guardar en la base de datos: ${msg}` }, { status: 500, headers: corsHeaders(req) })
  }

  return NextResponse.json({ ok: true, verified, name: finalName, subdomain: finalSubdomain }, { headers: corsHeaders(req) })
}

export async function GET() {
  const user = await db.substack.user.get()
  const cookie = await buildHeader()
  
  // If no relational user, try legacy settings as fallback to avoid breaking current users
  if (!user && !cookie) {
     const settings = await db.settings.get() as any
     if (settings.substackCookie && settings.substackProfile) {
        return NextResponse.json({
           connected: true,
           publication: settings.substackPublication,
           profile: settings.substackProfile
        })
     }
  }

  if (!user || !cookie) {
    return NextResponse.json({ connected: false })
  }

  const latestStats = await db.substack.stats.getLatest(user.id)

  return NextResponse.json({
    connected: true,
    publication: user.subdomain,
    profile: {
      name: user.name,
      handle: user.handle,
      avatar: user.photo_url,
      bio: user.bio,
      subCount: latestStats?.subscriber_count || user.subscriber_count,
      followerCount: latestStats?.follower_count || 0,
      subdomain: user.subdomain,
      pubId: user.publication_id,
      connectedAt: user.created_at,
      primaryPublication: {
        id: user.publication_id,
        name: user.subdomain,
        subdomain: user.subdomain
      }
    }
  })
}

export async function DELETE() {
  const user = await db.substack.user.get()
  if (user) {
    await db.substack.cookies.upsert({
      user_id: user.id,
      substack_sid: '',
      substack_lli: '',
      visit_id: '',
      updated_at: new Date().toISOString()
    })
  }
  // Also clear legacy
  const settings = await db.settings.get() as any
  const clean = { ...settings }
  delete clean.substackCookie
  delete clean.substackProfile
  await db.settings.save(clean)

  return NextResponse.json({ ok: true })
}

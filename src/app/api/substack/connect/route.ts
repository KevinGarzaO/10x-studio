import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

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

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

export async function POST(req: NextRequest) {
  const { cookies, publication, email, profileVerified, profile } = await req.json()

  if (!cookies || Object.keys(cookies).length === 0)
    return NextResponse.json({ error: 'No se recibieron cookies' }, { status: 400, headers: corsHeaders(req) })

  const cookieHeader = buildCookieHeader(cookies)
  let finalPublication = publication || ''
  let finalEmail       = email || ''
  let finalName        = ''
  let finalAvatar      = ''
  let finalSubCount    = 0
  let finalSubdomain   = ''
  let finalBio         = ''
  let finalHandle      = ''
  let finalLinks       = []
  let finalFollowers   = 0
  let finalLogo        = ''
  let verified         = profileVerified || false

  if (profileVerified && profile) {
    // If extension validated the session, use its payload
    finalPublication = profile?.primaryPublication?.name || publication || ''
    finalEmail       = profile?.email || email || ''
    finalName        = profile?.name || profile?.display_name || ''
    finalAvatar      = profile?.photo_url || profile?.profile_photo_url || ''
    finalSubCount    = profile?.primaryPublication?.subscriber_count || 0
    finalSubdomain   = profile?.primaryPublication?.subdomain || ''
    finalLogo        = profile?.primaryPublication?.logo_url || ''
    finalBio         = profile?.bio || ''
    finalHandle      = profile?.handle || ''
    finalLinks       = profile?.links || []
    finalFollowers   = profile?.followerCount || 0
    verified         = true
  } else {
    try {
      const meRes = await fetch('https://substack.com/api/v1/subscriber/me', {
        headers: {
          'Cookie':     cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':     'application/json',
          'Referer':    'https://substack.com/',
        }
      })

      if (meRes.ok) {
        const me         = await meRes.json()
        finalPublication = me?.primaryPublication?.name || publication || ''
        finalEmail       = me?.email || email || ''
        finalName        = me?.name || me?.display_name || ''
        finalAvatar      = me?.photo_url || me?.profile_photo_url || ''
        finalSubCount    = me?.primaryPublication?.subscriber_count || 0
        finalSubdomain   = me?.primaryPublication?.subdomain || ''
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

  // Save everything including profile data + cookie expiry estimate
  const connectedAt = new Date().toISOString()
  const expiresAt   = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString() // ~55 days

  const settings = db.settings.get()
  db.settings.save({
    ...settings,
    substackCookies:     cookies,
    substackCookie:      cookies['substack.sid'] || cookies['connect.sid'] || cookies['substack-sid'] || '',
    substackPublication: finalPublication,
    substackSubdomain:   finalSubdomain,
    substackProfile: {
      name:          finalName,
      handle:        finalHandle,
      bio:           finalBio,
      email:         finalEmail,
      avatar:        finalAvatar,
      pubLogo:       finalLogo,
      subCount:      finalSubCount,
      followerCount: finalFollowers,
      links:         finalLinks,
      pubId:         profile?.pubId || profile?.primaryPublication?.id || 0,
      primaryPublication: {
        name: finalPublication,
        subdomain: finalSubdomain,
      },
      connectedAt,
      expiresAt,
    },
  } as any)

  return NextResponse.json({
    ok: true, verified,
    publication: finalPublication,
    email:       finalEmail,
    name:        finalName,
    handle:      finalHandle,
    bio:         finalBio,
    avatar:      finalAvatar,
    pubLogo:     finalLogo,
    subCount:    finalSubCount,
    followers:   finalFollowers,
    links:       finalLinks,
    expiresAt,
    cookieNames: Object.keys(cookies),
  }, { headers: corsHeaders(req) })
}

export async function GET(req: NextRequest) {
  const settings = db.settings.get() as any
  return NextResponse.json({
    connected:   !!(settings.substackCookie || settings.substackCookies),
    publication: settings.substackPublication || '',
    profile:     settings.substackProfile || null,
  }, { headers: corsHeaders(req) })
}

export async function DELETE(req: NextRequest) {
  const settings = db.settings.get() as any
  const clean    = { ...settings }
  delete clean.substackCookie
  delete clean.substackCookies
  delete clean.substackPublication
  delete clean.substackProfile
  db.settings.save(clean)
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) })
}

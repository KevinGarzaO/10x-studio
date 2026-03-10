import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

function substackHeaders(cookie: string) {
  return {
    'Cookie': `connect.sid=${cookie}`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://substack.com/',
  }
}

function mapSubscriber(s: any) {
  return {
    id:           s.id,
    email:        s.email,
    name:         s.name || s.display_name || '',
    type:         s.subscription_type || s.type || 'free',
    createdAt:    s.created_at ? s.created_at.slice(0, 10) : '',
    country:      s.country || '',
    active:       s.active !== false,
    // Activity / engagement
    stars:        s.engagement_stars   ?? s.stars           ?? null,  // 0-5
    opens7d:      s.email_opens_7d     ?? s.opens_7_days    ?? null,
    opens30d:     s.email_opens_30d    ?? s.opens_30_days   ?? null,
    opens6m:      s.email_opens_180d   ?? s.opens_180_days  ?? null,
    revenue:      s.revenue_cents      != null ? s.revenue_cents / 100 : null,
    source:       s.source             ?? s.signup_source   ?? '',
  }
}

export async function GET(req: NextRequest) {
  const settings = await db.settings.get()
  const cookie = (settings as any).substackCookies ? Object.entries((settings as any).substackCookies).map(([k,v]:any) => `${k}=${v}`).join('; ') : (settings as any).substackCookie
  if (!cookie) return NextResponse.json({ error: 'Substack no conectado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const offset   = parseInt(searchParams.get('offset') || '0')
  const limit    = parseInt(searchParams.get('limit')  || '50')
  const type     = searchParams.get('type')    || 'all'
  const order    = searchParams.get('order')   || 'created_at'   // created_at | stars | revenue
  const direction = searchParams.get('dir')    || 'desc'

  try {
    // Get publication ID from settings directly to avoid Cloudflare 403 on subscriber/me
    const pubId = (settings as any).substackProfile?.pubId
    if (!pubId) throw new Error('No se encontró ID de publicación en la configuración')

    const params = new URLSearchParams({
      limit:     String(limit),
      offset:    String(offset),
      order_by:  order,
      order_dir: direction,
      ...(type !== 'all' ? { type } : {}),
    })

    const subRes = await fetch(
      `https://substack.com/api/v1/publication/${pubId}/subscribers?${params}`,
      { headers: substackHeaders(cookie) }
    )
    if (!subRes.ok) throw new Error(`Error obteniendo suscriptores: ${subRes.status}`)
    const data = await subRes.json()

    const raw         = data.subscribers || data || []
    const subscribers = Array.isArray(raw) ? raw.map(mapSubscriber) : []

    return NextResponse.json({
      subscribers,
      total:  data.total ?? subscribers.length,
      offset,
      limit,
    })

  } catch (e) {
    console.error('Substack subscribers error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const settings = await db.settings.get()
  const cookie = (settings as any).substackCookies ? Object.entries((settings as any).substackCookies).map(([k,v]:any) => `${k}=${v}`).join('; ') : (settings as any).substackCookie
  if (!cookie) return NextResponse.json({ error: 'Substack no conectado' }, { status: 401 })

  const { subscribers } = await req.json() as { subscribers: { email: string; name?: string }[] }
  if (!subscribers?.length) return NextResponse.json({ error: 'Lista vacía' }, { status: 400 })

  try {
    const pubId = (settings as any).substackProfile?.pubId
    if (!pubId) throw new Error('No se encontró ID de publicación en la configuración')

    const res = await fetch(`https://substack.com/api/v1/publication/${pubId}/subscribers/import`, {
      method: 'POST',
      headers: { ...substackHeaders(cookie), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribers }),
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Error importando: ${res.status} — ${txt.slice(0, 200)}`)
    }
    const result = await res.json()
    return NextResponse.json({ ok: true, imported: result.count ?? subscribers.length })

  } catch (e) {
    console.error('Substack import error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

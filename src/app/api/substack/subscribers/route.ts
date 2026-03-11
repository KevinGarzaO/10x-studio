import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

function substackHeaders(cookie: string) {
  return {
    'Cookie': cookie,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
    stars:        s.engagement_stars   ?? s.stars           ?? null,
    opens7d:      s.email_opens_7d     ?? s.opens_7_days    ?? null,
    opens30d:     s.email_opens_30d    ?? s.opens_30_days   ?? null,
    opens6m:      s.email_opens_180d   ?? s.opens_180_days  ?? null,
    revenue:      s.revenue_cents      != null ? s.revenue_cents / 100 : null,
    source:       s.source             ?? s.signup_source   ?? '',
  }
}

export async function GET(req: NextRequest) {
  const user = await db.substack.user.get()
  if (!user) return NextResponse.json({ error: 'No se encontró perfil de Substack' }, { status: 404 })

  const cookie = await buildCookieHeader()
  if (!cookie) return NextResponse.json({ error: 'Substack no conectado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const offset   = parseInt(searchParams.get('offset') || '0')
  const limit    = parseInt(searchParams.get('limit')  || '50')
  const type     = searchParams.get('type')    || 'all'
  const order    = searchParams.get('order')   || 'created_at'
  const direction = searchParams.get('dir')    || 'desc'

  try {
    const pubId = user.publication_id
    if (!pubId) throw new Error('No se encontró ID de publicación')

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
  const user = await db.substack.user.get()
  if (!user) return NextResponse.json({ error: 'No se encontró perfil' }, { status: 404 })

  const cookie = await buildCookieHeader()
  if (!cookie) return NextResponse.json({ error: 'Substack no conectado' }, { status: 401 })

  const { subscribers } = await req.json() as { subscribers: { email: string; name?: string }[] }
  if (!subscribers?.length) return NextResponse.json({ error: 'Lista vacía' }, { status: 400 })

  try {
    const pubId = user.publication_id
    if (!pubId) throw new Error('No se encontró ID de publicación')

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

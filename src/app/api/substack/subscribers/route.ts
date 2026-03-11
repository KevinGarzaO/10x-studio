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

  try {
    const pubSlug = user.subdomain
    if (!pubSlug) throw new Error('No se encontró slug de publicación')

    // Verified endpoint by user
    const url = `https://${pubSlug}.substack.com/api/v1/subscriber-stats`
    
    const subRes = await fetch(url, {
      method: 'POST',
      headers: { 
        ...substackHeaders(cookie),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filters: {
          order_by_desc_nulls_last: "subscription_created_at"
        },
        limit,
        offset
      })
    })

    if (!subRes.ok) {
      const errTxt = await subRes.text()
      console.error(`Substack API error (subscribers): ${subRes.status} ${errTxt}`)
      throw new Error(`Error obteniendo suscriptores: ${subRes.status}`)
    }

    const data = await subRes.json()

    const raw         = data.subscribers || []
    const subscribers = Array.isArray(raw) ? raw.map((s: any) => ({
      id:           String(s.subscription_id || s.user_id),
      email:        s.user_email_address || '',
      name:         s.user_name || '',
      type:         s.subscription_interval || 'free',
      createdAt:    s.subscription_created_at ? s.subscription_created_at.slice(0, 10) : '',
      country:      s.country || '',
      active:       s.is_subscribed !== false,
      stars:        s.activity_rating ?? null,
      opens7d:      null, // Not in this response
      opens30d:     null,
      opens6m:      null,
      revenue:      s.total_revenue_generated ?? null,
      source:       s.source ?? '',
    })) : []

    return NextResponse.json({
      subscribers,
      total:  data.count ?? subscribers.length,
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

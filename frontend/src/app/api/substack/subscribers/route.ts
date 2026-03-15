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
  const refresh  = searchParams.get('refresh') === 'true'

  if (!refresh) {
    const cached = await db.substack.subscribers.getAll(user.id)
    if (cached.length > 0) {
      const paginated = cached.slice(offset, offset + limit).map((c: any) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        type: c.type,
        createdAt: c.created_at,
        country: c.country,
        active: c.active,
        stars: c.stars,
        opens7d: c.opens7d,
        opens30d: c.opens30d,
        opens6m: c.opens6m,
        revenue: c.revenue,
        source: c.source
      }))
      return NextResponse.json({
        subscribers: paginated,
        total: cached.length,
        offset,
        limit,
      })
    }
  }

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
    const subscribers = Array.isArray(raw) ? raw.map((s: any, idx: number) => {
      // Find a reliable unique ID. Try explicit IDs first, then email, then a generated one with offset.
      const subId = s.subscription_id || s.id;
      const userId = s.user_id;
      const email = s.user_email_address;
      
      const uniqueId = subId 
        ? String(subId) 
        : userId 
          ? String(userId) 
          : email 
            ? String(email) 
            : `gen_${offset + idx}`;

      return {
        id:           uniqueId,
        email:        email || '',
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
      }
    }) : []

    const rowsToUpsert = subscribers
      .filter((sub: any) => sub.id !== '')
      .map((sub: any) => ({
        id: sub.id,
        user_id: user.id,
        email: sub.email,
        name: sub.name,
        type: sub.type,
        created_at: sub.createdAt,
        country: sub.country,
        active: sub.active,
        stars: sub.stars,
        opens7d: sub.opens7d,
        opens30d: sub.opens30d,
        opens6m: sub.opens6m,
        revenue: sub.revenue,
        source: sub.source,
        synced_at: new Date().toISOString()
      }))

    if (refresh && offset === 0) {
      try {
        await db.substack.subscribers.deleteAll(user.id)
      } catch (e) {
        console.warn("Could not delete previous subscribers, assuming first run or error:", e)
      }
    }

    console.log(`[Substack Subscribers] Fetched ${subscribers.length} raw subs, ${rowsToUpsert.length} prepared to upsert. First ID: ${rowsToUpsert[0]?.id}, Last ID: ${rowsToUpsert[rowsToUpsert.length - 1]?.id}`);

    if (rowsToUpsert.length > 0) {
      await db.substack.subscribers.upsertMany(rowsToUpsert)
    }

    // El frontend pide toda la data para paginar total.
    // Si la lectura en caché no respondió (es refresh), devolvemos el API.
    let apiTotal = data.count;

    // Fallback crítico: si el API de Substack no devuelve el count y estamos en refresh, 
    // usamos el valor del perfil (user.subscriber_count). Si no, lo calculamos.
    if (apiTotal == null) {
      if (!refresh) {
        // En modo caché, el total es el número de filas en la DB
        apiTotal = (await db.substack.subscribers.getAll(user.id)).length;
      } else {
        // En modo refresh, si no hay count en el JSON de Substack, usamos el del perfil 
        // o fallamos a un número basado en lo que tenemos + offset para no detener el bucle
        apiTotal = user.subscriber_count || (subscribers.length + offset);
        
        // Si el total sigue siendo bajo (como 1) y hay más de lo que parece, 
        // forzamos al menos un número que permita seguir paginando si el chunk vino lleno.
        if (apiTotal <= subscribers.length + offset && subscribers.length >= limit) {
          apiTotal = subscribers.length + offset + 1; // Fuerza un "hay más" artificial
        }
      }
    }
    
    // Si es refresh, también actualizamos el contador global en el "perfil" para que sea instantáneo en todo el app
    if (refresh && user && apiTotal && apiTotal > 0 && offset === 0) {
      await db.substack.user.upsert({ 
        substack_user_id: user.substack_user_id, 
        subscriber_count: apiTotal, 
        updated_at: new Date().toISOString() 
      })
    }

    return NextResponse.json({
      subscribers,
      total:  apiTotal,
      offset,
      limit,
    })

  } catch (e: any) {
    console.error('Substack subscribers error:', e)
    return NextResponse.json({ error: String(e.message || e), stack: e.stack }, { status: 500 })
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

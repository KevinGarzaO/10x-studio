import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader, substackHeaders } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await db.substack.user.get()
    if (!user) return NextResponse.json({ error: 'No se encontró usuario' }, { status: 404 })

    const latestStat = await db.substack.stats.getLatest(user.id)
    
    const { searchParams } = new URL(req.url)
    const refresh = searchParams.get('refresh') === 'true'

    if (latestStat && !refresh) {
      return NextResponse.json(latestStat)
    }

    // Refresh from Substack
    const cookie = await buildCookieHeader()
    if (!cookie) return NextResponse.json({ error: 'No hay cookies' }, { status: 401 })

    const pubSlug = user.subdomain
    if (!pubSlug) return NextResponse.json({ error: 'No se encontró slug de publicación' }, { status: 400 })

    const url = `https://${pubSlug}.substack.com/api/v1/subscriber-stats`
    // User mentioned this is a POST for subscriber-stats
    const res = await fetch(url, { 
      method: 'POST',
      headers: substackHeaders(cookie, pubSlug),
      body: JSON.stringify({})
    })

    if (!res.ok) {
      console.error(`Substack API error (stats): ${res.status}`)
      return NextResponse.json(latestStat || { error: 'No se pudieron obtener estadísticas' })
    }

    const statsData = await res.json()
    
    // Use the official count from Substack as primary source
    const subscriberCount = statsData.count ?? statsData.chartCounts?.totalEmail ?? 0

    const followerCount = statsData.follower_count ?? 0

    const newStat = {
      user_id: user.id,
      subscriber_count: subscriberCount,
      follower_count: followerCount,
      date: new Date().toISOString().split('T')[0]
    }

    await db.substack.stats.upsert(newStat)

    return NextResponse.json(newStat)
  } catch (error) {
    console.error('Stats API Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

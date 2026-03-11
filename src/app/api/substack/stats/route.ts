import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader, substackHeaders } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await db.substack.user.get()
    if (!user) return NextResponse.json({ error: 'No se encontró usuario' }, { status: 404 })

    const latestStat = await db.substack.stats.getLatest(user.id)
    
    // Check if we have data and it's fresh enough (e.g. 1 hour)
    const lastUpdate = latestStat ? new Date(latestStat.created_at).valueOf() : 0
    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    if (latestStat && (now - lastUpdate < oneHour)) {
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
    
    // Update Supabase
    const newStat = {
      user_id: user.id,
      subscriber_count: statsData.subscriber_count || 0,
      follower_count: statsData.follower_count || 0,
      date: new Date().toISOString().split('T')[0]
    }

    await db.substack.stats.upsert(newStat)

    return NextResponse.json(newStat)
  } catch (error) {
    console.error('Stats API Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

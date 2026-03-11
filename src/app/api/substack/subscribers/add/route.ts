import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { buildCookieHeader, substackHeaders } from '@/lib/substackPublisher'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

    const user = await db.substack.user.get()
    if (!user) return NextResponse.json({ error: 'No se encontró usuario' }, { status: 404 })

    const cookie = await buildCookieHeader()
    if (!cookie) return NextResponse.json({ error: 'No hay cookies' }, { status: 401 })

    const pubSlug = user.subdomain
    if (!pubSlug) return NextResponse.json({ error: 'No se encontró slug de publicación' }, { status: 400 })

    const url = `https://${pubSlug}.substack.com/api/v1/subscriber/add`
    const res = await fetch(url, { 
      method: 'POST',
      headers: substackHeaders(cookie, pubSlug),
      body: JSON.stringify({
        email,
        subscription: false,
        sendEmail: true
      })
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error(`Substack API error (add_sub): ${res.status} - ${txt}`)
      return NextResponse.json({ error: `Substack error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Add Subscriber API Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

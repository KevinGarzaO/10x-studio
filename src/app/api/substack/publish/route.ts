import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { publishNote, publishArticle, buildCookieHeader } from '@/lib/substackPublisher'

export async function POST(req: NextRequest) {
  const { type, content, title, subtitle, scheduleAt } = await req.json()

  const cookie = buildCookieHeader()
  if (!cookie) return NextResponse.json({ error: 'Substack no conectado. Usa la extensión de Chrome para conectar.' }, { status: 401 })
  if (!content?.trim()) return NextResponse.json({ error: 'El contenido no puede estar vacío' }, { status: 400 })
  if (type === 'article' && !title?.trim()) return NextResponse.json({ error: 'El título es requerido para artículos' }, { status: 400 })

  try {
    if (type === 'note') {
      const result = await publishNote(content)
      return NextResponse.json({ ok: true, ...result })
    }
    if (type === 'article') {
      const result = await publishArticle(title, content, subtitle, scheduleAt ?? null)
      return NextResponse.json({ ok: true, ...result })
    }
    return NextResponse.json({ error: 'Tipo inválido. Usa "note" o "article"' }, { status: 400 })
  } catch (e) {
    console.error('Substack publish error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

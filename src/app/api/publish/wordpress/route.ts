import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

function mdToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (!line.trim()) { out.push(''); continue }
    if (line.startsWith('### ')) { out.push(`<h3>${line.slice(4)}</h3>`); continue }
    if (line.startsWith('## '))  { out.push(`<h2>${line.slice(3)}</h2>`); continue }
    if (line.startsWith('# '))   { out.push(`<h1>${line.slice(2)}</h1>`); continue }
    if (line.startsWith('- ') || line.startsWith('* ')) { out.push(`<li>${line.slice(2)}</li>`); continue }
    const p = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
    out.push(`<p>${p}</p>`)
  }
  return out.join('\n')
}

export async function POST(req: NextRequest) {
  const { title, content, excerpt, status, tags, categories } = await req.json()
  const cfg = await db.integrations.get()

  if (!cfg.wpUrl || !cfg.wpUsername || !cfg.wpAppPassword)
    return NextResponse.json({ error: 'WordPress no configurado. Ve a Integraciones → WordPress.' }, { status: 401 })
  if (!title?.trim())   return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
  if (!content?.trim()) return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 })

  const baseUrl = cfg.wpUrl.replace(/\/$/, '')
  const auth    = Buffer.from(`${cfg.wpUsername}:${cfg.wpAppPassword}`).toString('base64')

  try {
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify({
        title:      title.trim(),
        content:    mdToHtml(content),
        excerpt:    excerpt?.trim() || '',
        status:     status || cfg.wpDefaultStatus || 'draft',
        tags:       tags || [],
        categories: categories || [],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `WordPress error ${res.status}`)
    }
    const post = await res.json()
    return NextResponse.json({ ok: true, id: post.id, url: post.link, status: post.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import { publishNote, publishArticle } from '@/lib/substackPublisher'

// This route is called every hour by the cron job (instrumented.ts)
// It also accepts manual GET calls for testing: /api/cron
export async function GET() {
  const settings  = db.settings.get()
  const cookie    = settings.substackCookie
  const scheduled = db.scheduled.getAll()
  const now       = new Date()

  // Find all pending posts whose scheduleAt is in the past
  const due = scheduled.filter(p =>
    p.status === 'pending' && new Date(p.scheduleAt) <= now
  )

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No hay publicaciones pendientes' })
  }

  if (!cookie) {
    return NextResponse.json({ ok: false, error: 'Substack no conectado — no se pueden publicar posts pendientes' })
  }

  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const post of due) {
    try {
      if (post.type === 'note') {
        await publishNote(post.content)
      } else {
        await publishArticle(post.title, post.content, '', null)
      }

      // Mark as published
      const updated = { ...post, status: 'published' as const, publishedAt: new Date().toISOString() }
      db.scheduled.save(db.scheduled.getAll().map(p => p.id === post.id ? updated : p))

      // Update calendar event status if linked
      if (post.calendarEventId) {
        const calEvents = db.calendar.getAll()
        db.calendar.save(calEvents.map(e =>
          e.id === post.calendarEventId ? { ...e, status: 'published' as const } : e
        ))
      }

      results.push({ id: post.id, ok: true })
    } catch (e) {
      // Mark as error but keep retrying next run
      const updated = { ...post, status: 'error' as const, errorMsg: String(e) }
      db.scheduled.save(db.scheduled.getAll().map(p => p.id === post.id ? updated : p))
      results.push({ id: post.id, ok: false, error: String(e) })
    }
  }

  const published = results.filter(r => r.ok).length
  const errors    = results.filter(r => !r.ok).length

  console.log(`[CRON] Procesados: ${due.length} | Publicados: ${published} | Errores: ${errors}`)
  return NextResponse.json({ ok: true, processed: due.length, published, errors, results })
}

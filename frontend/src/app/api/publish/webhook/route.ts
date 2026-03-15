import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

export const dynamic = 'force-dynamic'
import type { Platform } from '@/types'

export async function POST(req: NextRequest) {
  const { webhookId, title, content, platform, topic, wordCount } = await req.json()

  const cfg      = await db.integrations.get()
  const webhooks = cfg.webhooks || []
  const webhook  = webhookId
    ? webhooks.find(w => w.id === webhookId)
    : webhooks.find(w => w.active && w.platforms.includes(platform as Platform))

  if (!webhook) return NextResponse.json({ error: 'Webhook no encontrado o no activo' }, { status: 404 })
  if (!webhook.active) return NextResponse.json({ error: 'Webhook inactivo' }, { status: 400 })

  const payload = {
    event:     'content.published',
    timestamp: new Date().toISOString(),
    data: {
      title,
      content,
      platform,
      topic,
      wordCount,
    },
  }

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent':   'RedactorIA-Webhook/1.0',
  }
  if (webhook.secret) reqHeaders['X-Webhook-Secret'] = webhook.secret

  try {
    const res = await fetch(webhook.url, {
      method:  'POST',
      headers: reqHeaders,
      body:    JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Webhook respondió ${res.status}`)
    return NextResponse.json({ ok: true, webhookId: webhook.id, status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

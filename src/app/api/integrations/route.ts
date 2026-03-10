import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = await db.integrations.get()
  // Mask sensitive fields before sending to client
  return NextResponse.json({
    ...cfg,
    wpAppPassword:  cfg.wpAppPassword  ? '••••••••' : '',
    linkedinToken:  cfg.linkedinToken  ? '••••••••' : '',
    _hasWp:         !!(cfg.wpUrl && cfg.wpUsername && cfg.wpAppPassword),
    _hasLinkedin:   !!cfg.linkedinToken,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const current = await db.integrations.get()

  // Merge — don't overwrite masked values
  const updated = { ...current }
  if (body.wpUrl !== undefined)         updated.wpUrl         = body.wpUrl
  if (body.wpUsername !== undefined)    updated.wpUsername    = body.wpUsername
  if (body.wpDefaultStatus !== undefined) updated.wpDefaultStatus = body.wpDefaultStatus
  if (body.wpAppPassword && body.wpAppPassword !== '••••••••') updated.wpAppPassword = body.wpAppPassword
  if (body.linkedinToken && body.linkedinToken !== '••••••••') {
    updated.linkedinToken   = body.linkedinToken
    updated.linkedinPersonId = ''  // reset so it re-fetches
  }
  if (body.webhooks !== undefined) updated.webhooks = body.webhooks

  await db.integrations.save(updated)
  return NextResponse.json({ ok: true })
}

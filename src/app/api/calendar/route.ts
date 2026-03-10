import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { CalendarEvent } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const events = await db.calendar.getAll()
  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  const event = (await req.json()) as CalendarEvent
  const events = await db.calendar.getAll()
  events.push(event)
  await db.calendar.save(events)
  return NextResponse.json(event)
}

export async function PUT(req: NextRequest) {
  const updated = (await req.json()) as CalendarEvent
  const events = (await db.calendar.getAll()).map(e => (e.id === updated.id ? updated : e))
  await db.calendar.save(events)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const events = (await db.calendar.getAll()).filter(e => e.id !== id)
  await db.calendar.save(events)
  return NextResponse.json({ ok: true })
}

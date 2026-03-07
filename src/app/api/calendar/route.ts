import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { CalendarEvent } from '@/types'

export async function GET() {
  return NextResponse.json(db.calendar.getAll())
}

export async function POST(req: NextRequest) {
  const event = (await req.json()) as CalendarEvent
  const events = db.calendar.getAll()
  events.push(event)
  db.calendar.save(events)
  return NextResponse.json(event)
}

export async function PUT(req: NextRequest) {
  const updated = (await req.json()) as CalendarEvent
  const events = db.calendar.getAll().map(e => (e.id === updated.id ? updated : e))
  db.calendar.save(events)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const events = db.calendar.getAll().filter(e => e.id !== id)
  db.calendar.save(events)
  return NextResponse.json({ ok: true })
}

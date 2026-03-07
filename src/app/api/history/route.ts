import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { HistoryEntry } from '@/types'

export async function GET() {
  return NextResponse.json(db.history.getAll())
}

export async function POST(req: NextRequest) {
  const entry = (await req.json()) as HistoryEntry
  const history = db.history.getAll()
  history.unshift(entry)
  db.history.save(history)
  return NextResponse.json(entry)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const history = db.history.getAll().filter(h => h.id !== id)
  db.history.save(history)
  return NextResponse.json({ ok: true })
}

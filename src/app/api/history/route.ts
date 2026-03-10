import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { HistoryEntry } from '@/types'

export async function GET() {
  const history = await db.history.getAll()
  return NextResponse.json(history)
}

export async function POST(req: NextRequest) {
  const entry = (await req.json()) as HistoryEntry
  const history = await db.history.getAll()
  history.unshift(entry)
  await db.history.save(history)
  return NextResponse.json(entry)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const history = (await db.history.getAll()).filter(h => h.id !== id)
  await db.history.save(history)
  return NextResponse.json({ ok: true })
}

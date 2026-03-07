import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { Topic } from '@/types'

export async function GET() {
  return NextResponse.json(db.topics.getAll())
}

export async function POST(req: NextRequest) {
  const topic = (await req.json()) as Topic
  const topics = db.topics.getAll()
  topics.unshift(topic)
  db.topics.save(topics)
  return NextResponse.json(topic)
}

export async function PUT(req: NextRequest) {
  const updated = (await req.json()) as Topic
  const topics = db.topics.getAll().map(t => (t.id === updated.id ? updated : t))
  db.topics.save(topics)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const topics = db.topics.getAll().filter(t => t.id !== id)
  db.topics.save(topics)
  return NextResponse.json({ ok: true })
}

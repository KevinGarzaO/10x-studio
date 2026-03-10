import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { Topic } from '@/types'

export async function GET() {
  const topics = await db.topics.getAll()
  return NextResponse.json(topics)
}

export async function POST(req: NextRequest) {
  const topic = (await req.json()) as Topic
  const topics = await db.topics.getAll()
  topics.unshift(topic)
  await db.topics.save(topics)
  return NextResponse.json(topic)
}

export async function PUT(req: NextRequest) {
  const updated = (await req.json()) as Topic
  const topics = (await db.topics.getAll()).map(t => (t.id === updated.id ? updated : t))
  await db.topics.save(topics)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const topics = (await db.topics.getAll()).filter(t => t.id !== id)
  await db.topics.save(topics)
  return NextResponse.json({ ok: true })
}

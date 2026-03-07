import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { ScheduledPost } from '@/types'

export async function GET() {
  return NextResponse.json(db.scheduled.getAll())
}

export async function POST(req: NextRequest) {
  const post = (await req.json()) as ScheduledPost
  const all  = db.scheduled.getAll()
  all.push(post)
  db.scheduled.save(all)
  return NextResponse.json(post)
}

export async function PUT(req: NextRequest) {
  const post = (await req.json()) as ScheduledPost
  db.scheduled.save(db.scheduled.getAll().map(p => p.id === post.id ? post : p))
  return NextResponse.json(post)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  db.scheduled.save(db.scheduled.getAll().filter(p => p.id !== id))
  return NextResponse.json({ ok: true })
}

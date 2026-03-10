import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { ScheduledPost } from '@/types'

export async function GET() {
  const all = await db.scheduled.getAll()
  return NextResponse.json(all)
}

export async function POST(req: NextRequest) {
  const post = (await req.json()) as ScheduledPost
  const all = await db.scheduled.getAll()
  all.push(post)
  await db.scheduled.save(all)
  return NextResponse.json(post)
}

export async function PUT(req: NextRequest) {
  const post = (await req.json()) as ScheduledPost
  const all = await db.scheduled.getAll()
  await db.scheduled.save(all.map(p => p.id === post.id ? post : p))
  return NextResponse.json(post)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const all = await db.scheduled.getAll()
  await db.scheduled.save(all.filter(p => p.id !== id))
  return NextResponse.json({ ok: true })
}

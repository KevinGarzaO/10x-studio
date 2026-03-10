import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { PromptTemplate } from '@/types'

export async function GET() {
  const all = await db.templates.getAll()
  return NextResponse.json(all)
}
export async function POST(req: NextRequest) {
  const t = (await req.json()) as PromptTemplate
  const all = await db.templates.getAll()
  all.push(t)
  await db.templates.save(all)
  return NextResponse.json(t)
}
export async function PUT(req: NextRequest) {
  const t = (await req.json()) as PromptTemplate
  const all = await db.templates.getAll()
  await db.templates.save(all.map(x => x.id === t.id ? t : x))
  return NextResponse.json(t)
}
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const all = await db.templates.getAll()
  await db.templates.save(all.filter(x => x.id !== id))
  return NextResponse.json({ ok: true })
}

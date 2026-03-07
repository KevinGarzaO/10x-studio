import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { PromptTemplate } from '@/types'

export async function GET() { return NextResponse.json(db.templates.getAll()) }
export async function POST(req: NextRequest) {
  const t = (await req.json()) as PromptTemplate
  const all = db.templates.getAll(); all.push(t); db.templates.save(all)
  return NextResponse.json(t)
}
export async function PUT(req: NextRequest) {
  const t = (await req.json()) as PromptTemplate
  db.templates.save(db.templates.getAll().map(x => x.id === t.id ? t : x))
  return NextResponse.json(t)
}
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  db.templates.save(db.templates.getAll().filter(x => x.id !== id))
  return NextResponse.json({ ok: true })
}

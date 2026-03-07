import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { Campaign } from '@/types'

export async function GET() { return NextResponse.json(db.campaigns.getAll()) }
export async function POST(req: NextRequest) {
  const c = (await req.json()) as Campaign
  const all = db.campaigns.getAll(); all.push(c); db.campaigns.save(all)
  return NextResponse.json(c)
}
export async function PUT(req: NextRequest) {
  const c = (await req.json()) as Campaign
  db.campaigns.save(db.campaigns.getAll().map(x => x.id === c.id ? c : x))
  return NextResponse.json(c)
}
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  db.campaigns.save(db.campaigns.getAll().filter(x => x.id !== id))
  return NextResponse.json({ ok: true })
}

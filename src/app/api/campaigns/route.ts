import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { Campaign } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const all = await db.campaigns.getAll()
  return NextResponse.json(all)
}
export async function POST(req: NextRequest) {
  const c = (await req.json()) as Campaign
  const all = await db.campaigns.getAll()
  all.push(c)
  await db.campaigns.save(all)
  return NextResponse.json(c)
}
export async function PUT(req: NextRequest) {
  const c = (await req.json()) as Campaign
  const all = await db.campaigns.getAll()
  await db.campaigns.save(all.map(x => x.id === c.id ? c : x))
  return NextResponse.json(c)
}
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const all = await db.campaigns.getAll()
  await db.campaigns.save(all.filter(x => x.id !== id))
  return NextResponse.json({ ok: true })
}

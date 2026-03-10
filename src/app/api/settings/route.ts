import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { AppSettings } from '@/types'

export async function GET() {
  const settings = await db.settings.get()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  const settings = (await req.json()) as AppSettings
  await db.settings.save(settings)
  return NextResponse.json(settings)
}

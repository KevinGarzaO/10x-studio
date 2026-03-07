import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'
import type { AppSettings } from '@/types'

export async function GET() {
  return NextResponse.json(db.settings.get())
}

export async function POST(req: NextRequest) {
  const settings = (await req.json()) as AppSettings
  db.settings.save(settings)
  return NextResponse.json(settings)
}

import { NextRequest, NextResponse } from 'next/server'
import { buildPrompt } from '@/lib/prompts'
import type { Platform } from '@/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { topic, platform, length, tone, audience, keywords, extract, apiKey, customPrompt, mode, targetLang } = body as {
    topic: string
    platform: Platform
    length: string
    tone: string
    audience?: string
    keywords?: string
    extract?: string
    apiKey: string
    customPrompt?: string   // from template
    mode?: 'generate' | 'revise' | 'translate'
    targetLang?: string
  }

  if (!apiKey) return NextResponse.json({ error: 'API key requerida' }, { status: 400 })

  let prompt: string
  if (mode === 'revise') {
    prompt = `Eres editor experto. Mejora el siguiente texto manteniendo la voz del autor.
Objetivo: mejorar claridad, fluidez, estructura y engagement. NO cambies el tema ni el mensaje central.
${audience ? `Audiencia: ${audience}` : ''}
Texto original:
---
${extract}
---
Devuelve solo el texto mejorado, sin comentarios ni explicaciones.`
  } else if (mode === 'translate') {
    prompt = `Traduce el siguiente texto al ${targetLang || 'inglés'}.
Mantén el tono, estilo, formato markdown y estructura exactos del original.
Texto:
---
${extract}
---
Devuelve solo el texto traducido.`
  } else if (customPrompt) {
    // Template-based: inject variables
    prompt = customPrompt
      .replace(/\{\{topic\}\}/g, topic)
      .replace(/\{\{length\}\}/g, length)
      .replace(/\{\{tone\}\}/g, tone)
      .replace(/\{\{audience\}\}/g, audience || '')
      .replace(/\{\{keywords\}\}/g, keywords || '')
      .replace(/\{\{extract\}\}/g, extract || '')
  } else {
    prompt = buildPrompt({ topic, platform, length, tone, audience, keywords, extract })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  })

  const data = await res.json()
  if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 })
  return NextResponse.json({ text: data.content[0].text, usage: data.usage })
}

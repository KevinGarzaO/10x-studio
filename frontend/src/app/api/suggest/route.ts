import { NextRequest, NextResponse } from 'next/server'
import { buildSuggestTopicsPrompt, buildSchedulePrompt } from '@/lib/prompts'

export async function POST(req: NextRequest) {
  const { type, niche, audience, existing, topics, today, apiKey, topic } = await req.json()
  if (!apiKey) return NextResponse.json({ error: 'API key requerida' }, { status: 400 })

  let prompt: string
  if (type === 'schedule') {
    prompt = buildSchedulePrompt(topics, existing, niche, today)
  } else if (type === 'research') {
    prompt = `Eres investigador de contenido experto. Analiza este tema para un artículo:
Tema: "${topic}"
Nicho: ${niche || 'general'}
Audiencia: ${audience || 'general'}

Devuelve SOLO JSON sin markdown:
{
  "summary": "resumen de 2-3 oraciones de qué cubrir",
  "angles": ["ángulo 1", "ángulo 2", "ángulo 3"],
  "keyPoints": ["punto clave 1", "punto clave 2", "punto clave 3", "punto clave 4"],
  "seoKeyword": "keyword principal sugerida",
  "estimatedVolume": "Alto/Medio/Bajo",
  "competitionLevel": "Alta/Media/Baja",
  "relatedTopics": ["tema relacionado 1", "tema relacionado 2", "tema relacionado 3"]
}`
  } else {
    prompt = buildSuggestTopicsPrompt(niche, audience, existing)
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 })
  const text = data.content[0].text.replace(/```json|```/g, '').trim()
  return NextResponse.json(JSON.parse(text))
}

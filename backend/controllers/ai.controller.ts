import { Request, Response } from 'express'
import fetch from 'node-fetch'
import { buildPrompt, buildSuggestTopicsPrompt, Platform } from '../lib/prompts'

export const generate = async (req: Request, res: Response) => {
  const { topic, platform, length, tone, audience, keywords, extract, apiKey, customPrompt, mode, targetLang } = req.body
  
  if (!apiKey) return res.status(400).json({ error: 'API key requerida' })

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
    prompt = customPrompt
      .replace(/\{\{topic\}\}/g, topic)
      .replace(/\{\{length\}\}/g, length)
      .replace(/\{\{tone\}\}/g, tone)
      .replace(/\{\{audience\}\}/g, audience || '')
      .replace(/\{\{keywords\}\}/g, keywords || '')
      .replace(/\{\{extract\}\}/g, extract || '')
  } else {
    prompt = buildPrompt({ topic, platform: platform as Platform, length, tone, audience, keywords, extract })
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-api-key': apiKey, 
        'anthropic-version': '2023-06-01' 
      },
      body: JSON.stringify({ 
        model: 'claude-haiku-4-5-20251001', 
        max_tokens: 4000, 
        messages: [{ role: 'user', content: prompt }] 
      }),
    })

    const data: any = await aiRes.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    res.json({ text: data.content[0].text, usage: data.usage })
  } catch {
    res.status(500).json({ error: 'Error calling AI API' })
  }
}

export const suggest = async (req: Request, res: Response) => {
  const { niche, audience, existing, apiKey } = req.body
  if (!apiKey) return res.status(400).json({ error: 'API key requerida' })

  const prompt = buildSuggestTopicsPrompt(niche, audience, existing || [])

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'x-api-key': apiKey, 
        'anthropic-version': '2023-06-01' 
      },
      body: JSON.stringify({ 
        model: 'claude-haiku-4-5-20251001', 
        max_tokens: 2000, 
        messages: [{ role: 'user', content: prompt }] 
      }),
    })

    const data: any = await aiRes.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    
    // Parse the inner JSON from text response
    try {
      const result = JSON.parse(data.content[0].text)
      res.json(result)
    } catch {
      res.status(500).json({ error: 'Failed to parse AI response' })
    }
  } catch {
    res.status(500).json({ error: 'Error calling AI API' })
  }
}

export const generateSubstack = async (req: Request, res: Response) => {
  const { topic, platform, length, tone } = req.body
  const apiKey = process.env.CLAUDE_API_KEY || req.body.apiKey // Fallback to body apiKey if env not set for some reason

  if (!apiKey) {
    return res.status(400).json({ error: 'API key requerida. Configura CLAUDE_API_KEY en las variables de entorno.' })
  }

  const prompt = `
Eres un ghostwriter experto que escribe en el estilo de Kevin Garza — fundador de Transformateck.

Estilo de escritura:
- Español mexicano conversacional
- Narrativa personal con historias reales
- Honesto sobre limitaciones y fracasos
- Directo, sin rodeos
- Párrafos cortos
- Enfocado en emprendedores y creadores latinos

Escribe un ${platform === 'article' ? 'artículo de newsletter' : 'nota corta'} sobre: "${topic}"

Extensión: ${length} palabras aproximadamente
Tono: ${tone}

${platform === 'article' ? 
`Incluye: título atractivo, introducción con historia personal, desarrollo con puntos prácticos, cierre con llamada a la acción.
Responde SOLO en este formato JSON estricto (sin explicaciones adicionales):
{
  "titulo": "título del artículo",
  "subtitulo": "subtítulo opcional",
  "contenido": "cuerpo del artículo en texto plano o markdown con saltos de línea"
}` : 
`Es una nota corta y directa — máximo 300 palabras, sin título.
Responde SOLO en este formato JSON estricto:
{
  "titulo": "",
  "subtitulo": "",
  "contenido": "cuerpo de la nota en texto plano"
}`
}
`

// Helper to convert markdown to HTML string (TipTap parses HTML natively into ProseMirror AST)
function mdToProseMirror(md: string) {
  const blocks = md.split('\n\n').filter(b => b.trim())
  let html = ''
  
  let inList = false

  for (const block of blocks) {
    if (block.startsWith('- ')) {
      if (!inList) {
        html += '<ul>\n'
        inList = true
      }
      const items = block.split('\n').filter(line => line.trim().startsWith('- '))
      for (const item of items) {
        let itemHtml = item.replace(/^- /, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        html += `<li><p>${itemHtml}</p></li>\n`
      }
      continue
    }

    if (inList) {
      html += '</ul>\n'
      inList = false
    }

    let parsedBlock = block.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    if (parsedBlock.startsWith('# ')) {
      html += `<h1>${parsedBlock.replace(/^#\s/, '')}</h1>\n`
    } else if (parsedBlock.startsWith('## ')) {
      html += `<h2>${parsedBlock.replace(/^##\s/, '')}</h2>\n`
    } else if (parsedBlock.startsWith('### ')) {
      html += `<h3>${parsedBlock.replace(/^###\s/, '')}</h3>\n`
    } else {
      html += `<p>${parsedBlock}</p>\n`
    }
  }

  if (inList) {
    html += '</ul>\n'
  }

  return html
}

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data: any = await aiRes.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    
    // We expect { titulo, subtitulo, contenido } in the JSON response
    let rawText = data.content[0].text.trim()
    if (rawText.startsWith('```json')) rawText = rawText.slice(7)
    if (rawText.startsWith('```')) rawText = rawText.slice(3)
    if (rawText.endsWith('```')) rawText = rawText.slice(0, -3)
    
    try {
      const parsed = JSON.parse(rawText.trim())
      const pmContent = mdToProseMirror(parsed.contenido || '')
      
      res.json({ 
        titulo: parsed.titulo, 
        subtitulo: parsed.subtitulo, 
        contenido: pmContent,
        contenido_raw: parsed.contenido,
        usage: data.usage 
      })
    } catch (e) {
      console.error('Failed to parse AI JSON:', rawText)
      res.status(500).json({ error: 'Claude no retornó un JSON válido.' })
    }
    
  } catch (error: any) {
    console.error('Error in generateSubstack:', error)
    res.status(500).json({ error: 'Error calling Anthropic API' })
  }
}

export const suggestWeb = async (req: Request, res: Response) => {
  const { userInput, apiKey: bodyApiKey } = req.body
  const apiKey = process.env.CLAUDE_API_KEY || bodyApiKey

  if (!apiKey) {
    return res.status(400).json({ error: 'API key requerida. Configura CLAUDE_API_KEY en las variables de entorno.' })
  }

  const prompt = `
Eres un experto en contenido para emprendedores latinos.

El usuario quiere publicar contenido sobre: "${userInput}"

Busca en internet las tendencias más recientes sobre este tema y sugiere exactamente 3 títulos de artículos o posts que serían muy relevantes y atractivos para emprendedores latinos en 2026.

Responde SOLO en este formato JSON sin nada más:
{
  "temas": [
    {
      "titulo": "título del artículo",
      "descripcion": "descripción breve de 1 oración de qué trataría",
      "por_que": "por qué este tema es relevante ahorita"
    },
    {
      "titulo": "...",
      "descripcion": "...",
      "por_que": "..."
    },
    {
      "titulo": "...",
      "descripcion": "...",
      "por_que": "..."
    }
  ]
}
`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data: any = await aiRes.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    
    // Parse JSON
    try {
      // Claude might return server_tool_use traces, so we need to find the final text block
      const textBlock = data.content.find((block: any) => block.type === 'text');
      if (!textBlock || !textBlock.text) {
        throw new Error('No text block found in Claude response');
      }
      
      let rawText = textBlock.text.trim();
      
      // Remove generic markdown block syntax if present
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim()
      }
      
      // Sometimes Claude includes conversational filler at the start or end
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        rawText = rawText.substring(firstBrace, lastBrace + 1)
      }

      const resultObj = JSON.parse(rawText)
      res.json(resultObj)
    } catch (parseError) {
      console.error('Failed to parse web suggest JSON:', data.content);
      return res.status(500).json({ error: 'Claude JSON Error: ' + JSON.stringify(data.content) });
    }
  } catch (error: any) {
    console.error('Error in suggestWeb:', error)
    res.status(500).json({ error: 'Error calling Anthropic API' })
  }
}

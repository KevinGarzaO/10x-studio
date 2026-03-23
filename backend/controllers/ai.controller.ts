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
Eres un ghostwriter experto que escribe exactamente como Kevin Garza — fundador de Transformateck.

GUÍA DE VOZ Y ESTILO:

Estructura narrativa:
- Abre SIEMPRE con una historia real o anécdota personal
- Presenta el problema a través de alguien más (un amigo, un cliente, alguien conocido)
- Desarrolla con reflexión personal honesta
- Cierra SIEMPRE con llamada a unirse al grupo de WhatsApp de Transformateck

Tono:
- Conversacional mexicano — como platicando con un amigo de confianza
- Directo y sin rodeos
- Honesto sobre limitaciones y fracasos
- Nunca presumido, siempre humano y vulnerable
- Usa "Mira," al inicio de párrafos importantes
- Usa "Y aquí está..." para revelar insights clave
- Usa "Déjame decirte algo" para momentos de verdad incómoda

Formato:
- Párrafos cortos — máximo 3-4 líneas
- Subtítulos en negrita con mayúsculas en cada palabra importante
- Listas solo cuando son absolutamente necesarias
- Números escritos en texto — "cuarenta y siete" no "47"
- Sin introducciones genéricas ni conclusiones corporativas

Frases características de Kevin:
- "Mira,"
- "Y aquí está el secreto que nadie te cuenta"
- "Déjame decirte algo"
- "¿Sabes qué realmente..."
- "Vamos por 1,000"
- "Nos vemos del otro lado"

Cierre SIEMPRE debe incluir:
- Párrafo invitando a unirse al grupo de WhatsApp de Transformateck (Usa frases casuales y cortas)
- Mencionar que son más de 600 personas y van por 1,000
- Hashtags relevantes al tema (5 máximo)

Audiencia:
- Emprendedores y creadores de contenido latinos
- Personas que quieren usar IA para crecer su negocio
- Comunidad hispanohablante en LATAM

Ahora escribe un artículo sobre: "${topic}"

Extensión: ${length} palabras aproximadamente
Tono adicional: ${tone}

${platform === 'article' ? 
  'Es un artículo de newsletter largo con subtítulos, historias y reflexiones profundas.' : 
  'Es una nota corta y directa — máximo 300 palabras, sin subtítulos, muy conversacional.'
}

Responde SOLO en este formato JSON sin nada más:
{
  "titulo": "título del artículo",
  "subtitulo": "subtítulo opcional",
  "contenido": "contenido completo del artículo"
}
`

// Helper to convert markdown to HTML string (TipTap parses HTML natively into ProseMirror AST)
function mdToProseMirror(md: string) {
  const blocks = md.split('\n\n').filter(b => b.trim())
  const total = blocks.length
  const firstThird = Math.max(1, Math.floor(total * 0.25))
  const middle = Math.max(2, Math.floor(total * 0.55))
  const end = total - 1
  
  let html = ''
  let inList = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.startsWith('- ')) {
      if (!inList) {
        html += '<ul>\n'
        inList = true
      }
      const items = block.split('\n').filter(line => line.trim().startsWith('- '))
      for (const item of items) {
        let itemHtml = item
          .replace(/^- /, '')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
        html += `<li><p>${itemHtml}</p></li>\n`
      }
      continue
    }

    if (inList) {
      html += '</ul>\n'
      inList = false
    }

    let parsedBlock = block
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>')

    if (parsedBlock.startsWith('# ')) {
      html += `<h1>${parsedBlock.replace(/^#\s/, '')}</h1>\n`
    } else if (parsedBlock.startsWith('## ')) {
      html += `<h2>${parsedBlock.replace(/^##\s/, '')}</h2>\n`
    } else if (parsedBlock.startsWith('### ')) {
      html += `<h3>${parsedBlock.replace(/^###\s/, '')}</h3>\n`
    } else {
      html += `<p>${parsedBlock}</p>\n`
    }
    
    // Inject Subscribe Widgets exactly after parsing the targeted blocks
    if (i === firstThird || i === middle || i === end) {
      if (inList) {
        html += '</ul>\n'
        inList = false
      }
      html += '<div data-type="subscribe-widget"></div>\n'
    }
  }

  if (inList) {
    html += '</ul>\n'
  }

  // FORCE HARDCODED CLOSING NATIVELY TO PREVENT JSON FORMATTING COLLAPSES
  html += `
<p><strong>¿Ya eres parte de nuestra comunidad de WhatsApp?</strong></p>
<p>Mira, somos más de 600 personas construyendo la comunidad de IA más grande en español y Latinoamérica. Tenemos un grupo activo en WhatsApp donde compartimos noticias como esta en tiempo real, discutimos las implicaciones para nuestros negocios y nos ayudamos entre todos.</p>
<p>Esta semana estamos discutiendo GPT-5.4, si vale la pena adoptarlo ahora o esperar, y cómo proteger tu negocio de estas crisis entre plataformas.</p>
<p>No es solo leer noticias. Es entender las implicaciones reales con gente que está aplicando esto en sus empresas.</p>
<p>Vamos por 1,000 miembros. Si esto que leíste te resonó, deberías estar ahí.</p>
<p><a href="https://chat.whatsapp.com/CQsp63vm1oW3QNS3Q87gZA">Únete al grupo de WhatsApp</a></p>
<p>Nos vemos del otro lado.</p>
<p>Kevin Garza<br>Fundador, Transformateck</p>
<p>#OpenAI #GPT54 #InteligenciaArtificial #Claude #Anthropic #Transformateck #IA #TechStrategy #AIModels #SamAltman</p>
`
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

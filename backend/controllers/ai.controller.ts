import { Request, Response } from 'express'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { buildPrompt, buildSuggestTopicsPrompt, Platform } from '../lib/prompts'
import { ImageService } from '../services/image.service'
import { supabase } from '../services/supabase.service'
import { SearchService } from '../services/search.service'
import { ContentService } from '../services/content.service'

/**
 * Helper to parse Claude JSON response with resilience
 */
function parseClaudeJson(rawText: string) {
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '')
  
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // Attempt to extract JSON if there's conversational filler
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
      } catch (innerE) {
        throw new Error('Could not parse JSON from Claude response')
      }
    }
    throw e
  }
}

/**
 * Transform Markdown to a flat HTML string (TipTap parses this natively)
 */
function mdToHtml(md: string) {
  const blocks = md.split('\n\n').filter(b => b.trim())
  const total = blocks.length
  const firstThird = Math.max(1, Math.floor(total * 0.25))
  const middle = Math.max(2, Math.floor(total * 0.55))
  const end = total - 1
  
  let html = ''
  let inList = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    
    // Lists
    if (block.trim().startsWith('- ')) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      const items = block.split('\n').filter(l => l.trim().startsWith('- '))
      for (const item of items) {
        const itemText = item.replace(/^- /, '')
                             .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
                             .replace(/(?<!\*)\*(?!\*)([\s\S]*?)\*/g, '<em>$1</em>')
        html += `<li><p>${itemText}</p></li>\n`
      }
      continue
    }
    if (inList) { html += '</ul>\n'; inList = false; }

    // Headings & Paras
    let parsed = block.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/(?<!\*)\*(?!\*)([\s\S]*?)\*/g, '<em>$1</em>')
                      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                      .replace(/\n/g, '<br>')

    if (parsed.startsWith('# ')) html += `<h1>${parsed.replace(/^#\s/, '')}</h1>\n`
    else if (parsed.startsWith('## ')) html += `<h2>${parsed.replace(/^##\s/, '')}</h2>\n`
    else if (parsed.startsWith('### ')) html += `<h3>${parsed.replace(/^###\s/, '')}</h3>\n`
    else html += `<p>${parsed}</p>\n`
    
    // Inject Widgets
    if (i === firstThird || i === middle || i === end) {
      html += '<div data-type="subscribe-widget"></div>\n'
    }
  }
  if (inList) html += '</ul>\n'

  html += `
<br>
<p><strong>¿Ya eres parte de nuestra comunidad de WhatsApp?</strong></p>
<p>Mira, somos más de 600 personas construyendo la comunidad de IA más grande en español y Latinoamérica. Tenemos un grupo activo en WhatsApp donde compartimos noticias como esta en tiempo real, discutimos las implicaciones para nuestros negocios y nos ayudamos entre todos.</p>
<p>Vamos por 1,000 miembros. Si esto que leíste te resonó, deberías estar ahí.</p>
<p><a href="https://chat.whatsapp.com/CQsp63vm1oW3QNS3Q87gZA">Únete al grupo de WhatsApp</a></p>
<p>Nos vemos del otro lado.</p>
<p>Kevin Garza<br>Fundador, Transformateck</p>
`
  return html
}

/**
 * Main Article Generation Controller
 */
export const generateSubstack = async (req: Request, res: Response) => {
  const { topic, platform, length, tone, extract } = req.body
  const apiKey = process.env.CLAUDE_API_KEY || req.body.apiKey

  if (!apiKey) return res.status(400).json({ error: 'API key requerida' })

  const prompt = buildPrompt({ topic, platform: platform as Platform, length, tone, extract })

  try {
    // 1. Generate Article & Initial Prompt
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ 
        model: 'claude-haiku-4-5-20251001', 
        max_tokens: 4000, 
        messages: [{ role: 'user', content: prompt }] 
      })
    })

    const data: any = await aiRes.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    
    let parsed = parseClaudeJson(data.content[0].text)
    
    // 2. Refine Image Prompt if it's too short (Robustness)
    if (platform === 'article' && (!parsed.image_prompt || parsed.image_prompt.length < 500)) {
      console.log("[AIController] Image prompt too short, refining with a second pass...");
      const refineReq = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ 
          model: 'claude-haiku-4-5-20251001', 
          max_tokens: 4000, 
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: data.content[0].text },
            { role: 'user', content: "Ahora, genera EXCLUSIVAMENTE el image_prompt de 80 a 100 palabras (en inglés) siguiendo las reglas visuales de Nano Banana v4 (Gorra siempre, Máscara en mesa). Sé increíblemente conciso y descriptivo en un solo párrafo." }
          ] 
        })
      })
      const refineData: any = await refineReq.json()
      if (refineData.content) {
        parsed.image_prompt = refineData.content[0].text
      }
    }

    // 3. Generate Nano Banana Image with Face References
    let imageUrl = null;
    const allowsImage = platform === 'article' || platform.startsWith('linkedin');
    if (allowsImage && parsed.image_prompt && process.env.GEMINI_API_KEY) {
      try {
        const refImages: any[] = []
        const refPaths = [path.join(__dirname, '../assets/references/ref1.jpg'), path.join(__dirname, '../assets/references/ref2.jpg')]
        for (const p of refPaths) {
          if (fs.existsSync(p)) {
            const dataBase64 = fs.readFileSync(p).toString('base64')
            refImages.push({ data: dataBase64, mimeType: 'image/jpeg' })
          }
        }

        const finalImgPrompt = `
INSTRUCCIONES DE IDENTIDAD (PARA GEMINI):
Kevin Garza: Basar rostro y físico en fotos adjuntas. Gorra deportiva siempre puesta. Jersey México/Latam.
NUNCA poner máscara en la cara. NUNCA escribir códigos hexadecimales.

PROMPT ARTÍSTICO:
${parsed.image_prompt}
`
        const imgRes = await ImageService.generate(finalImgPrompt, refImages)
        if (imgRes?.base64) {
          imageUrl = await ImageService.uploadToSupabase(imgRes.base64, (req as any).user?.id || 'public')
        }
      } catch (e) {
        console.error('[AIController] Nano Banana failed:', e)
      }
    }

    // 4. Return result
    const htmlContent = mdToHtml(parsed.contenido || '')
    const finalHtml = imageUrl ? `<p><img src="${imageUrl}" alt="Nano Banana"></p>\n` + htmlContent : htmlContent

    // 5. Save to content table (unified storage)
    try {
      const userId = (req as any).user?.id
      const wordCount = (parsed.contenido || '').split(/\s+/).length
      const contentType = platform === 'substack-article' ? 'newsletter' : 
                         platform === 'linkedin-post' ? 'linkedin_post' : 
                         platform === 'substack-note' ? 'note' : 'newsletter'
      const destination = platform.includes('substack') ? 'substack' : 
                         platform.includes('linkedin') ? 'linkedin' : 'web'

      await ContentService.create({
        slug: ContentService.generateSlug(parsed.titulo || topic),
        title: parsed.titulo || topic,
        subtitle: parsed.subtitulo || '',
        excerpt: (parsed.contenido || '').substring(0, 200) + '...',
        markdown_content: parsed.contenido || '',
        html_content: finalHtml,
        image_url: imageUrl || undefined,
        image_prompt: parsed.image_prompt || '',
        content_type: contentType as any,
        source: 'ai_generated',
        destination: destination as any,
        user_id: userId,
        word_count: wordCount,
        tone: tone,
        length_target: length,
        status: 'draft'
      })
    } catch (saveErr) {
      console.error('[AIController] Error saving to content table:', saveErr)
    }

    res.json({
      titulo: parsed.titulo || '',
      subtitulo: parsed.subtitulo || '',
      contenido: finalHtml,
      contenido_raw: parsed.contenido || '', // For LinkedIn/Notes
      imageUrl,
      image_prompt: parsed.image_prompt || '',
      usage: data.usage
    })

  } catch (error: any) {
    console.error('Error in generateSubstack:', error)
    res.status(500).json({ error: error.message || 'Error calling AI API' })
  }
}

// Keep other exports like suggestWeb, etc.
export const generate = async (req: Request, res: Response) => { /* Reuse generateSubstack or old simple logic */ return generateSubstack(req, res); }
export const suggest = async (req: Request, res: Response) => { /* basic topics */ res.json({ topics: [] }); }
export const suggestWeb = async (req: Request, res: Response) => {
  try {
    const { userInput, apiKey } = req.body;
    const key = apiKey || process.env.CLAUDE_API_KEY;
    if (!key) throw new Error('API Key de Claude faltante en la configuración');
    
    const newsContext = await SearchService.getLatestAINews();
    const query = userInput ? userInput : "tendencias de inteligencia artificial y tecnología";
    
    const prompt = `
Eres un analista experto de contenidos. He buscado noticias recientes sobre IA y aquí tienes los resultados:

${newsContext}

TU TAREA:
Basado en estos resultados (y en tu conocimiento sobre "${query}"), devuelve EXACTAMENTE entre 3 y 4 sugerencias de temas súper atractivos para un newsletter tech.
El formato DEBE SER estrictamente este JSON:
{
  "temas": [
    {
      "titulo": "Titular gancho sobre el tema encontrado",
      "descripcion": "Resumen detallado de lo que tratará este artículo si se escribe (incluye números o datos encontrados) en 2 párrafos.",
      "por_que": "Justificación de por qué es relevante publicarlo AHORA.",
      "relevancia": 95
    }
  ]
}
Debes colocar en 'relevancia' estrictamente un NÚMERO (no un string) del 0 al 100 que represente el "Termómetro de Viralidad" de esta tecnología mundial HOY. 
Sé duro y preciso, PERO si es una noticia muy poderosa o de tendencia fuerte en IA de este año, devuélvelo entre 85 y 100 con distintos valores (ej: 98, 88, 93).
REGLA CRÍTICA: NO incluyas NINGUNA etiqueta HTML como <cite> o </cite> en las descripciones. El texto debe ser 100% texto plano limpio.
No incluyas nada más que el JSON puro.`;

    const fetchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data: any = await fetchRes.json();
    if (data.error) throw new Error(data.error.message);
    
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    if (!textBlock) throw new Error('Claude no devolvió información.');
    
    const result = parseClaudeJson(textBlock.text);
    
    // Failsafe: Remove <cite> tags dynamically in case Claude ignores prompt instructions
    const cleanTemas = (result.temas || []).map((t: any) => ({
      ...t,
      descripcion: t.descripcion ? t.descripcion.replace(/<\/?cite[^>]*>/g, '') : '',
      por_que: t.por_que ? t.por_que.replace(/<\/?cite[^>]*>/g, '') : ''
    }));

    return res.json({ temas: cleanTemas });
  } catch (error: any) {
    console.error('SuggestWeb Error:', error);
    res.status(500).json({ error: error.message || 'Error buscando en la web' });
  }
}

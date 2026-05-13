import fetch from 'node-fetch'
import { buildPrompt, Platform } from '../lib/prompts'
import { ImageService } from './image.service'
import { SubstackService } from './substack.service'
import fs from 'fs'
import path from 'path'
import { SearchService } from './search.service'

// Helper to reliably parse JSON coming from Claude
function parseClaudeJson(rawText: string) {
  let cleaned = rawText.trim()
  
  // Try to find the JSON block if it exists
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('[AutoPublisher] Failed to parse JSON. Raw text was:', rawText)
    throw new Error('Could not parse JSON from Claude response')
  }
}

// Reuse logic from controller for HTML formatting
// Removed duplicated mdToHtml, now handled by SubstackService with mdToAST

export class AutoPublisherService {
  /**
   * 1. Usa Claude con Tools para buscar noticias recientes de IA y seleccionar un tema ganador.
   */
  static async findTrendingTopicForToday(excludedTopics: string[] = []): Promise<{ topic: string, extract: string, relevance_score: number }> {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) throw new Error('CLAUDE_API_KEY no configurada.')

    // 1. Obtener noticias reales de Google News
    const newsContext = await SearchService.getLatestAINews();
    console.log('[AutoPublisher] Noticias reales obtenidas. Consultando a Claude...');
    
    const prompt = `
Eres un analista de tendencias tech de alto nivel para Transformateck.
He buscado noticias recientes sobre IA y aquí tienes los resultados más frescos:

${newsContext}

TU TAREA:
1. Analiza estas noticias y elige la más importante, disruptiva y actual (o combina varias si están relacionadas).
2. Enfócate en herramientas, nuevas versiones o casos de impacto real para negocios.

IMPORTANTE: NO elijas ninguna noticia relacionada con los siguientes temas (YA FUERON CUBIERTOS):
${excludedTopics.length > 0 ? excludedTopics.map(t => `- ${t}`).join('\n') : 'Ninguno todavía.'}

Una vez elijas la MEJOR noticia, responde ESTRICTAMENTE en este formato JSON:
{
  "topic": "Un titular corto y potente sobre la noticia",
  "extract": "Un resumen crudo de 3-4 párrafos con los datos reales, porcentajes y explicaciones técnicas encontradas en la noticia.",
  "relevance_score": 85
}

Nota: relevance_score debe ser un número del 0 al 100 indicando qué tan "viral" y "útil" es esta noticia hoy.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data: any = await res.json()
    if (!data.content) throw new Error(`[AutoPublisher] Claude error: ${JSON.stringify(data)}`)
    
    const textBlock = data.content.find((b: any) => b.type === 'text');
    if (textBlock) {
      const result = parseClaudeJson(textBlock.text)
      return { 
        topic: result.topic, 
        extract: result.extract, 
        relevance_score: result.relevance_score || 0 
      }
    }
    throw new Error('[AutoPublisher] Claude no devolvió texto válido.')
  }

  /**
   * 2. Escribe el contenido con la base de datos usando buildPrompt.
   */
  static async writeArticle(topic: string, extract: string, platform: Platform = 'substack-article') {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) throw new Error('CLAUDE_API_KEY missing.')

    console.log(`[AutoPublisher] Redactando para ${platform} sobre: ${topic}...`);
    const prompt = buildPrompt({ 
      topic, 
      platform, 
      length: platform.startsWith('linkedin') ? '300' : '1000', 
      tone: 'conversacional, persuasivo y experto',
      extract
    })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data: any = await res.json()
    let parsed = parseClaudeJson(data.content[0].text)

    // Robustez de imagen
    if (!parsed.image_prompt || parsed.image_prompt.length < 50) {
      console.log('[AutoPublisher] Refinando image_prompt compacto Nano Banana (80-100 palabras)...');
      const refineReq = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ 
          model: 'claude-haiku-4-5-20251001', max_tokens: 2000, 
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

    return parsed;
  }

  /**
   * 3. Genera la imagen y arma todo, luego crea un DRAFT en Substack.
   */
  static async publishFlowForUser(userId: string) {
    try {
      const { supabase } = require('./supabase.service')
      console.log('================ SUBSTACK AUTO START ================')
      console.log(`[SubstackAuto] Iniciando flujo para el usuario ${userId}`);

      // A. Consultar Memoria (últimos temas publicados tanto en LI como Substack)
      const { data: recentHistory } = await supabase
        .from('history')
        .select('topic')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(15)
      
      const excluded = recentHistory?.map((h: any) => h.topic).filter(Boolean) || []

      // 1. Obtener Trending Topic con Scoring
      const { topic, extract, relevance_score } = await this.findTrendingTopicForToday(excluded);
      console.log(`[SubstackAuto] Noticia: "${topic}" | Score: ${relevance_score}`);

      if (relevance_score < 85) {
        console.log(`[SubstackAuto] Score (${relevance_score}) insuficiente para artículo. Abortando.`);
        return;
      }

      // 2. Redactar el contenido (Plataforma: substack-article)
      const articleObj = await this.writeArticle(topic, extract, 'substack-article');
      console.log(`[SubstackAuto] Artículo redactado: ${articleObj.titulo}`);

      // 3. Generar Imagen Nano Banana v5
      let imageUrl = null;
      if (articleObj.image_prompt && process.env.GEMINI_API_KEY) {
        console.log(`[AutoPublisher] Dibujando infografía Nano Banana v5...`);
        const refImages: any[] = []
        const refPaths = [path.join(__dirname, '../assets/references/ref1.jpg'), path.join(__dirname, '../assets/references/ref2.jpg')]
        for (const p of refPaths) {
          if (fs.existsSync(p)) {
            refImages.push({ data: fs.readFileSync(p).toString('base64'), mimeType: 'image/jpeg' })
          }
        }
        
        const finalImgPrompt = `
INSTRUCCIONES DE IDENTIDAD (PARA GEMINI):
Kevin Garza: Basar rostro y físico en fotos adjuntas. Gorra deportiva siempre puesta. Jersey México/Latam.
NUNCA poner máscara en la cara. NUNCA escribir códigos hexadecimales.

PROMPT ARTÍSTICO (CREA UNA INFOGRAFÍA VISUAL!):
${articleObj.image_prompt}
`;
        
        const imgRes = await ImageService.generate(finalImgPrompt, refImages)
        if (imgRes?.base64) {
          imageUrl = await ImageService.uploadToSupabase(imgRes.base64, userId)
        }
      }

      // 4. Armar el cuerpo (Markdown + Imagen HTML para que el conversor la reconozca)
      const markdownContent = articleObj.contenido || ''
      const finalBody = imageUrl ? `<img src="${imageUrl}" alt="Nano Banana v5">\n\n` + markdownContent : markdownContent

      // 5. Crear DRAFT en Substack
      console.log('[SubstackAuto] Iniciando carga a Substack...');
      const draft = await SubstackService.createDraft(userId, {
        draft_title: articleObj.titulo.trim(),
        draft_subtitle: articleObj.subtitulo.trim()
      })

      // 6. Actualizar borrador con contenido
      await SubstackService.updateDraft(userId, String(draft.id), {
        draft_title: articleObj.titulo.trim(),
        draft_subtitle: articleObj.subtitulo.trim(),
        draft_body: finalBody,
        audience: 'everyone',
        type: 'newsletter'
      })

      // 7. PROGRAMAR PARA EL MISMO DÍA (L, M, V)
      const scheduledDate = new Date();
      // No sumamos días para que se publique el mismo día que se ejecuta el cron
      
      console.log(`[SubstackAuto] Programando artículo para hoy: ${scheduledDate.toISOString()}`);
      await SubstackService.scheduleDraft(userId, String(draft.id), scheduledDate.toISOString());

      // 8. Registrar en el Historial para Memoria
      await supabase.from('history').insert({
        user_id: userId,
        topic: topic,
        type: 'substack-article',
        content: articleObj.contenido,
        status: 'scheduled'
      })

      console.log(`[SubstackAuto] ✅ ÉXITO: Artículo programado para próximamente con ID ${draft.id}`);
      console.log('================ SUBSTACK AUTO END ==================')
    } catch (e) {
      console.error('[AutoPublisher] FALLO GENERAL:', e);
    }
  }

  /**
   * 4. Flujo Autónomo para LinkedIn (Busca, Califica y Pública si score > 85)
   */
  static async publishLinkedInAutoFlow(userId: string) {
    try {
      const { supabase } = require('./supabase.service')
      const { LinkedInService } = require('./linkedin.service')
      
      console.log('================ LINKEDIN AUTO START ================')
      
      // A. Consultar Memoria (últimos temas publicados)
      const { data: recentHistory } = await supabase
        .from('history')
        .select('topic')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(15)
      
      const excluded = recentHistory?.map((h: any) => h.topic).filter(Boolean) || []

      // 1. Encontrar Tema Trending con Scoring
      const { topic, extract, relevance_score } = await this.findTrendingTopicForToday(excluded)
      console.log(`[LinkedInAuto] Noticia: "${topic}" | Score: ${relevance_score}`)

      if (relevance_score < 85) {
        console.log(`[LinkedInAuto] Score (${relevance_score}) insuficiente para LinkedIn. Abortando.`);
        return;
      }

      // 2. Obtener Credenciales de LinkedIn
      const { data: profile } = await supabase.from('linkedin_profiles').select('*').eq('user_id', userId).single()
      if (!profile || !profile.access_token) {
        console.error('[LinkedInAuto] No se encontraron credenciales de LinkedIn para el usuario.');
        return;
      }

      // 3. Redactar Post
      const postObj = await this.writeArticle(topic, extract, 'linkedin-post')
      
      // 4. Generar Imagen Nano Banana v5
      let imageUrl = null;
      let imageBase64 = null;
      if (postObj.image_prompt && process.env.GEMINI_API_KEY) {
        console.log(`[LinkedInAuto] Generando infografía para LinkedIn...`);
        const refImages: any[] = []
        const refPaths = [path.join(__dirname, '../assets/references/ref1.jpg'), path.join(__dirname, '../assets/references/ref2.jpg')]
        for (const p of refPaths) {
          if (fs.existsSync(p)) {
            refImages.push({ data: fs.readFileSync(p).toString('base64'), mimeType: 'image/jpeg' })
          }
        }
        
        const finalImgPrompt = `
INSTRUCCIONES DE IDENTIDAD (PARA GEMINI):
Kevin Garza: Basar rostro y físico en fotos adjuntas. Gorra deportiva siempre puesta. Jersey deportivo global al azar (NO Tigres/America).
NUNCA poner máscara en la cara. NUNCA escribir códigos hexadecimales.

PROMPT ARTÍSTICO (INFOGRAFÍA DINÁMICA):
${postObj.image_prompt}
`;
        const imgRes = await ImageService.generate(finalImgPrompt, refImages)
        if (imgRes?.base64) {
          imageBase64 = imgRes.base64
          imageUrl = await ImageService.uploadToSupabase(imgRes.base64, userId)
        }
      }

      // 5. Publicar Directamente
      console.log(`[LinkedInAuto] Publicando en LinkedIn...`);
      const postId = await LinkedInService.publish({
        token: profile.access_token,
        urn: `urn:li:person:${profile.linkedin_id}`,
        text: postObj.contenido,
        imageBase64: imageBase64,
        imageUrl: imageUrl
      })

      // 6. Registrar en el Historial para Memoria
      await supabase.from('history').insert({
        user_id: userId,
        topic: topic,
        type: 'linkedin-post',
        content: postObj.contenido,
        status: 'published'
      })

      // 7. Registrar en la tabla de posts específica
      await supabase.from('linkedin_posts').insert({
        user_id: userId,
        post_id: postId,
        text: postObj.contenido,
        published_at: new Date().toISOString()
      })

      console.log(`[LinkedInAuto] ✅ ÉXITO: Publicado en LinkedIn con ID ${postId}`);
      console.log('================ LINKEDIN AUTO END ==================')
    } catch (e) {
      console.error('[LinkedInAuto] FALLO:', e);
    }
  }
}

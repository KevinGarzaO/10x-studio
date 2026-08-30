import fetch from 'node-fetch'
import { buildPrompt, Platform } from '../lib/prompts'
import { ImageService } from './image.service'
import { SubstackService } from './substack.service'
import fs from 'fs'
import path from 'path'
import { SearchService } from './search.service'

function parseClaudeJson(rawText: string) {
  let cleaned = rawText.trim()
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

async function loadRefImages(): Promise<{ data: string, mimeType: string }[]> {
  const refImages: { data: string, mimeType: string }[] = []
  const refPaths = [
    path.join(__dirname, '../assets/references/ref1.jpg'),
    path.join(__dirname, '../assets/references/ref2.jpg')
  ]
  for (const p of refPaths) {
    if (fs.existsSync(p)) {
      refImages.push({ data: fs.readFileSync(p).toString('base64'), mimeType: 'image/jpeg' })
    }
  }
  return refImages
}

const IDENTITY_PROMPT = `
INSTRUCCIONES DE IDENTIDAD (PARA GEMINI):
Kevin Garza: Basar rostro y físico en fotos adjuntas. Gorra deportiva siempre puesta. Jersey deportivo global al azar (NO Tigres/America).
NUNCA poner máscara en la cara. NUNCA escribir códigos hexadecimales.

PROMPT ARTÍSTICO (CREA UNA INFOGRAFÍA VISUAL!):
`

export class AutoPublisherService {

  static async findTrendingTopicForToday(excludedTopics: string[] = []): Promise<{ topic: string, extract: string, relevance_score: number }> {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) throw new Error('CLAUDE_API_KEY no configurada.')

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

  static async writeArticle(topic: string, extract: string, platform: Platform = 'substack-article', language: 'es' | 'en' = 'es') {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) throw new Error('CLAUDE_API_KEY missing.')

    console.log(`[AutoPublisher] Redactando para ${platform} (${language}) sobre: ${topic}...`);
    const prompt = buildPrompt({
      topic,
      platform,
      length: platform.startsWith('linkedin') ? '300' : '1000',
      tone: 'conversacional, persuasivo y experto',
      extract,
      language
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

    if (!parsed.image_prompt || parsed.image_prompt.length < 50) {
      console.log('[AutoPublisher] Refinando image_prompt...');
      const refineReq = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: data.content[0].text },
            { role: 'user', content: "Ahora, genera EXCLUSIVAMENTE el image_prompt de 80 a 100 palabras (en inglés) siguiendo las reglas visuales de Nano Banana v5 (Gorra siempre, Máscara en mesa). Sé increíblemente conciso y descriptivo en un solo párrafo." }
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
   * Generate image once and upload to Supabase. Returns { imageUrl, imageBase64 }.
   */
  private static async generateImage(imagePrompt: string, userId: string): Promise<{ imageUrl: string | null, imageBase64: string | null }> {
    if (!imagePrompt || !process.env.GEMINI_API_KEY) {
      console.log('[DailyOrchestrator] No image_prompt or GEMINI_API_KEY, skipping image generation.');
      return { imageUrl: null, imageBase64: null }
    }

    console.log('[DailyOrchestrator] Generando imagen (una sola para todos los formatos)...');
    const refImages = await loadRefImages()
    const finalImgPrompt = `${IDENTITY_PROMPT}${imagePrompt}`

    const imgRes = await ImageService.generate(finalImgPrompt, refImages)
    if (imgRes?.base64) {
      const imageUrl = await ImageService.uploadToSupabase(imgRes.base64, userId)
      console.log(`[DailyOrchestrator] Imagen generada y subida: ${imageUrl ? 'OK' : 'FALLO'}`);
      return { imageUrl, imageBase64: imgRes.base64 }
    }

    console.warn('[DailyOrchestrator] No se pudo generar la imagen.');
    return { imageUrl: null, imageBase64: null }
  }

  /**
   * UNIFIED DAILY ORCHESTRATOR
   * 
   * Runs once daily at 11:45 AM Monterrey.
   * 1. Finds 1 trending topic
   * 2. Generates 1 image (shared across all formats)
   * 3. Creates blog post → publishes to web (content table, status: published)
   * 4. Creates LinkedIn post → publishes to LinkedIn (API + content table)
   * 5. Creates newsletter draft → schedules on Substack (only L/M/V)
   */
  static async publishDailyContent(userId: string) {
    try {
      const { supabase } = require('./supabase.service')
      const { ContentService } = require('./content.service')

      console.log('================ DAILY ORCHESTRATOR START ================')
      console.log(`[DailyOrchestrator] Iniciando flujo diario para usuario ${userId}`);

      // A. Get excluded topics (recent history across ALL formats)
      const { data: recentHistory } = await supabase
        .from('history')
        .select('topic')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(20)

      const excluded = recentHistory?.map((h: any) => h.topic).filter(Boolean) || []

      // B. Find 1 trending topic
      const { topic, extract, relevance_score } = await this.findTrendingTopicForToday(excluded);
      console.log(`[DailyOrchestrator] Tema: "${topic}" | Score: ${relevance_score}`);

      if (relevance_score < 85) {
        console.log(`[DailyOrchestrator] Score (${relevance_score}) insuficiente. Abortando.`);
        return;
      }

      // C. Write blog content FIRST (to get the image_prompt)
      const blogObj = await this.writeArticle(topic, extract, 'blog')
      console.log(`[DailyOrchestrator] Blog redactado: ${blogObj.titulo}`);

      // D. Generate ONE image (shared across blog, linkedin, newsletter)
      const { imageUrl, imageBase64 } = await this.generateImage(blogObj.image_prompt, userId)

      // E. Build blog body with image
      const blogMarkdown = blogObj.contenido || ''
      const blogHtml = imageUrl
        ? `<img src="${imageUrl}" alt="Nano Banana v5">\n\n` + blogMarkdown
        : blogMarkdown

      // F. Determine day of week (used for scheduling decisions)
      const dayOfWeek = new Date().getUTCDay() // 0=Sun, 1=Mon, ... 6=Sat

      // ============================================
      // 1. BLOG POST → publish to web
      // ============================================
      console.log('[DailyOrchestrator] Guardando blog post...');
      const blogSlug = ContentService.generateSlug(blogObj.titulo)
      const blogWordCount = blogMarkdown.split(/\s+/).length

      const blogContent = await ContentService.create({
        slug: blogSlug,
        title: blogObj.titulo,
        subtitle: blogObj.subtitulo || '',
        excerpt: blogMarkdown.substring(0, 200) + '...',
        markdown_content: blogMarkdown,
        html_content: blogHtml,
        image_url: imageUrl || undefined,
        image_prompt: blogObj.image_prompt || '',
        content_type: 'blog_post',
        source: 'ai_generated',
        destination: 'web',
        user_id: userId,
        word_count: blogWordCount,
        tone: 'conversacional, persuasivo y experto',
        length_target: '1000',
        status: 'published',
        published_at: new Date().toISOString()
      })
      console.log(`[DailyOrchestrator] Blog publicado: ${blogContent.id}`);

      // ============================================
      // 2. LINKEDIN POST → publish to LinkedIn API
      // ============================================
      console.log('[DailyOrchestrator] Publicando en LinkedIn...');
      let linkedinPostId = null;

      try {
        const { data: profile } = await supabase
          .from('linkedin_profiles')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (profile?.access_token) {
          const { LinkedInService } = require('./linkedin.service')

          // Write LinkedIn content using the SAME topic/extract
          const liObj = await this.writeArticle(topic, extract, 'linkedin-post')
          console.log(`[DailyOrchestrator] LinkedIn redactado: ${liObj.titulo}`);

          // Publish to LinkedIn with the SAME image
          linkedinPostId = await LinkedInService.publish({
            token: profile.access_token,
            urn: `urn:li:person:${profile.linkedin_id}`,
            text: liObj.contenido,
            imageBase64: imageBase64,
            imageUrl: imageUrl
          })

          // Save to linkedin_posts table
          await supabase.from('linkedin_posts').insert({
            user_id: userId,
            post_id: linkedinPostId,
            text: liObj.contenido,
            published_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          })

          // Save to content table
          const liSlug = ContentService.generateSlug(liObj.titulo || topic)
          await ContentService.create({
            slug: liSlug,
            title: liObj.titulo || topic,
            subtitle: '',
            excerpt: (liObj.contenido || '').substring(0, 200) + '...',
            markdown_content: liObj.contenido || '',
            html_content: liObj.contenido || '',
            image_url: imageUrl || undefined,
            image_prompt: blogObj.image_prompt || '',
            content_type: 'linkedin_post',
            source: 'ai_generated',
            destination: 'linkedin',
            user_id: userId,
            word_count: (liObj.contenido || '').split(/\s+/).length,
            tone: 'conversacional, persuasivo y experto',
            length_target: '300',
            status: 'published',
            published_at: new Date().toISOString(),
            external_id: linkedinPostId
          })

          console.log(`[DailyOrchestrator] LinkedIn publicado: ${linkedinPostId}`);
        } else {
          console.warn('[DailyOrchestrator] No hay credenciales de LinkedIn. Saltando.');
        }
      } catch (liErr) {
        console.error('[DailyOrchestrator] Error publicando en LinkedIn:', liErr);
      }

      // ============================================
      // 3. ENGLISH VERSION (Blog + LinkedIn) → scheduled for 4PM every day
      // ============================================
      {
        console.log('[DailyOrchestrator] Generando contenido en inglés para 4PM...');
        try {
          // Schedule for 4PM Monterrey = 22:00 UTC today
          const fourPM = new Date();
          fourPM.setUTCHours(22, 0, 0, 0);

          // Blog English
          const blogEnObj = await this.writeArticle(topic, extract, 'blog', 'en')
          console.log(`[DailyOrchestrator] Blog EN redactado: ${blogEnObj.titulo}`);

          const blogEnMarkdown = blogEnObj.contenido || ''
          const blogEnHtml = imageUrl
            ? `<img src="${imageUrl}" alt="Nano Banana v5">\n\n` + blogEnMarkdown
            : blogEnMarkdown

          const blogEnSlug = ContentService.generateSlug(blogEnObj.titulo)
          await ContentService.create({
            slug: blogEnSlug,
            title: blogEnObj.titulo,
            subtitle: blogEnObj.subtitulo || '',
            excerpt: blogEnMarkdown.substring(0, 200) + '...',
            markdown_content: blogEnMarkdown,
            html_content: blogEnHtml,
            image_url: imageUrl || undefined,
            image_prompt: blogObj.image_prompt || '',
            content_type: 'blog_post',
            source: 'ai_generated',
            destination: 'web',
            user_id: userId,
            word_count: blogEnMarkdown.split(/\s+/).length,
            tone: 'conversacional, persuasivo y experto',
            length_target: '1000',
            status: 'scheduled',
            published_at: fourPM.toISOString()
          })
          console.log(`[DailyOrchestrator] Blog EN programado para 4PM`);

          // LinkedIn English
          const liEnObj = await this.writeArticle(topic, extract, 'linkedin-post', 'en')
          console.log(`[DailyOrchestrator] LinkedIn EN redactado: ${liEnObj.titulo}`);

          const liEnSlug = ContentService.generateSlug(liEnObj.titulo || topic)
          await ContentService.create({
            slug: liEnSlug,
            title: liEnObj.titulo || topic,
            subtitle: '',
            excerpt: (liEnObj.contenido || '').substring(0, 200) + '...',
            markdown_content: liEnObj.contenido || '',
            html_content: liEnObj.contenido || '',
            image_url: imageUrl || undefined,
            image_prompt: blogObj.image_prompt || '',
            content_type: 'linkedin_post',
            source: 'ai_generated',
            destination: 'linkedin',
            user_id: userId,
            word_count: (liEnObj.contenido || '').split(/\s+/).length,
            tone: 'conversacional, persuasivo y experto',
            length_target: '300',
            status: 'scheduled',
            published_at: fourPM.toISOString()
          })
          console.log(`[DailyOrchestrator] LinkedIn EN programado para 4PM`);
        } catch (enErr) {
          console.error('[DailyOrchestrator] Error generando contenido EN:', enErr);
        }
      }

      // ============================================
      // 4. NEWSLETTER (Substack) → only on L/M/V
      // ============================================
      const isSubstackDay = [1, 3, 5].includes(dayOfWeek) // Mon, Wed, Fri

      if (isSubstackDay) {
        console.log('[DailyOrchestrator] Es día de Substack (L/M/V). Creando draft...');
        try {
          // Write newsletter content using the SAME topic/extract
          const nlObj = await this.writeArticle(topic, extract, 'substack-article')
          console.log(`[DailyOrchestrator] Newsletter redactado: ${nlObj.titulo}`);

          // Build body with the SAME image
          const nlMarkdown = nlObj.contenido || ''
          const nlBody = imageUrl
            ? `<img src="${imageUrl}" alt="Nano Banana v5">\n\n` + nlMarkdown
            : nlMarkdown

          // Create Substack draft
          const draft = await SubstackService.createDraft(userId, {
            draft_title: nlObj.titulo.trim(),
            draft_subtitle: nlObj.subtitulo?.trim() || ''
          })

          await SubstackService.updateDraft(userId, String(draft.id), {
            draft_title: nlObj.titulo.trim(),
            draft_subtitle: nlObj.subtitulo?.trim() || '',
            draft_body: nlBody,
            audience: 'everyone',
            type: 'newsletter'
          })

          // Schedule for today (+5 min margin)
          const scheduledDate = new Date();
          scheduledDate.setMinutes(scheduledDate.getMinutes() + 5);
          await SubstackService.scheduleDraft(userId, String(draft.id), scheduledDate.toISOString())

          // Save to content table
          const nlSlug = ContentService.generateSlug(nlObj.titulo)
          await ContentService.create({
            slug: nlSlug,
            title: nlObj.titulo,
            subtitle: nlObj.subtitulo || '',
            excerpt: nlMarkdown.substring(0, 200) + '...',
            markdown_content: nlMarkdown,
            html_content: nlBody,
            image_url: imageUrl || undefined,
            image_prompt: blogObj.image_prompt || '',
            content_type: 'newsletter',
            source: 'ai_generated',
            destination: 'substack',
            user_id: userId,
            word_count: nlMarkdown.split(/\s+/).length,
            tone: 'conversacional, persuasivo y experto',
            length_target: '1000',
            status: 'published',
            published_at: new Date().toISOString(),
            external_id: String(draft.id)
          })

          console.log(`[DailyOrchestrator] Newsletter programado: ${draft.id}`);
        } catch (nlErr) {
          console.error('[DailyOrchestrator] Error creando newsletter:', nlErr);
        }
      } else {
        console.log(`[DailyOrchestrator] Hoy es día ${dayOfWeek} (no L/M/V). Saltando newsletter.`);
      }

      // ============================================
      // 4. Register in history (memory for dedup)
      // ============================================
      await supabase.from('history').insert({
        user_id: userId,
        topic: topic,
        type: 'daily_orchestrator',
        content: blogMarkdown.substring(0, 500),
        status: 'published'
      })

      console.log(`[DailyOrchestrator] ✅ FLUJO DIARIO COMPLETADO`);
      console.log(`  - Blog ES: ${blogContent.id}`);
      console.log(`  - LinkedIn ES: ${linkedinPostId || 'saltado'}`);
      console.log(`  - Blog EN: programado 4PM`);
      console.log(`  - LinkedIn EN: programado 4PM`);
      console.log(`  - Newsletter: ${isSubstackDay ? 'programado' : 'no es día L/M/V'}`);
      console.log(`  - Imagen: ${imageUrl ? 'compartida' : 'no generada'}`);
      console.log('================ DAILY ORCHESTRATOR END ==================')

    } catch (e) {
      console.error('[DailyOrchestrator] FALLO GENERAL:', e);
    }
  }

  /**
   * PUBLISH SCHEDULED ENGLISH CONTENT
   * 
   * Runs Mon-Fri at 4PM Monterrey (22:00 UTC).
   * Publishes blog + LinkedIn posts that were scheduled earlier today.
   */
  static async publishScheduledEnglishContent(userId: string) {
    try {
      const { supabase } = require('./supabase.service')
      const { ContentService } = require('./content.service')

      console.log('================ ENGLISH 4PM PUBLISHER START ================')

      // Find scheduled English content for today
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

      const { data: scheduledPosts, error } = await supabase
        .from('content')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'scheduled')
        .eq('source', 'ai_generated')
        .gte('published_at', today.toISOString())
        .lt('published_at', tomorrow.toISOString())

      if (error) throw error
      if (!scheduledPosts || scheduledPosts.length === 0) {
        console.log('[English4PM] No hay contenido programado para hoy.');
        console.log('================ ENGLISH 4PM PUBLISHER END ==================')
        return
      }

      console.log(`[English4PM] Encontrados ${scheduledPosts.length} posts programados`);

      for (const post of scheduledPosts) {
        try {
          if (post.content_type === 'blog_post') {
            // Blog is already in content table, just mark as published
            await ContentService.update(post.id, { status: 'published' })
            console.log(`[English4PM] Blog EN publicado: ${post.title}`);

          } else if (post.content_type === 'linkedin_post') {
            // Publish to LinkedIn API
            const { data: profile } = await supabase
              .from('linkedin_profiles')
              .select('*')
              .eq('user_id', userId)
              .single()

            if (profile?.access_token) {
              const { LinkedInService } = require('./linkedin.service')

              // Download image from URL if available
              let imageBase64 = null
              if (post.image_url) {
                try {
                  const imgFetch = await fetch(post.image_url)
                  const imgBuf = Buffer.from(await imgFetch.arrayBuffer())
                  imageBase64 = imgBuf.toString('base64')
                } catch (imgErr) {
                  console.warn('[English4PM] No se pudo descargar imagen:', imgErr)
                }
              }

              const postId = await LinkedInService.publish({
                token: profile.access_token,
                urn: `urn:li:person:${profile.linkedin_id}`,
                text: post.markdown_content || post.html_content || '',
                imageBase64,
                imageUrl: post.image_url
              })

              // Update content table
              await ContentService.update(post.id, {
                status: 'published',
                external_id: postId
              })

              // Save to linkedin_posts
              await supabase.from('linkedin_posts').insert({
                user_id: userId,
                post_id: postId,
                text: post.markdown_content || '',
                published_at: new Date().toISOString(),
                synced_at: new Date().toISOString()
              })

              console.log(`[English4PM] LinkedIn EN publicado: ${postId}`);
            } else {
              console.warn('[English4PM] No hay credenciales de LinkedIn.');
            }
          }
        } catch (postErr) {
          console.error(`[English4PM] Error publicando "${post.title}":`, postErr);
        }
      }

      console.log('================ ENGLISH 4PM PUBLISHER END ==================')
    } catch (e) {
      console.error('[English4PM] FALLO GENERAL:', e);
    }
  }
}

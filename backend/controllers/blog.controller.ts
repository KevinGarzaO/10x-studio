import { Request, Response } from 'express'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { buildPrompt } from '../lib/prompts'
import { ImageService } from '../services/image.service'
import { ContentService } from '../services/content.service'
import { supabase } from '../services/supabase.service'

/**
 * Helper to parse Claude JSON response
 */
function parseClaudeJson(rawText: string) {
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '')
  
  try {
    return JSON.parse(cleaned)
  } catch (e) {
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
 * Transform Markdown to HTML
 */
function mdToHtml(md: string) {
  const blocks = md.split('\n\n').filter(b => b.trim())
  let html = ''
  let inList = false

  for (const block of blocks) {
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

    let parsed = block.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/(?<!\*)\*(?!\*)([\s\S]*?)\*/g, '<em>$1</em>')
                      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                      .replace(/\n/g, '<br>')

    if (parsed.startsWith('# ')) html += `<h1>${parsed.replace(/^#\s/, '')}</h1>\n`
    else if (parsed.startsWith('## ')) html += `<h2>${parsed.replace(/^##\s/, '')}</h2>\n`
    else if (parsed.startsWith('### ')) html += `<h3>${parsed.replace(/^###\s/, '')}</h3>\n`
    else html += `<p>${parsed}</p>\n`
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
 * Generate a blog post and save to content table
 */
export const generateBlog = async (req: Request, res: Response) => {
  const { topic, length, tone, extract, destination } = req.body
  const apiKey = process.env.CLAUDE_API_KEY || req.body.apiKey

  if (!apiKey) return res.status(400).json({ error: 'API key requerida' })
  if (!topic) return res.status(400).json({ error: 'Topic requerido' })

  const finalLength = length || '1500'
  const finalTone = tone || 'conversacional, persuasivo y experto'

  try {
    // 1. Generate content with Claude
    const prompt = buildPrompt({ 
      topic, 
      platform: 'blog', 
      length: finalLength, 
      tone: finalTone, 
      extract 
    })

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

    let parsed = parseClaudeJson(data.content[0].text)

    // 2. Refine image prompt if too short
    if (!parsed.image_prompt || parsed.image_prompt.length < 50) {
      const refineReq = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-api-key': apiKey, 
          'anthropic-version': '2023-06-01' 
        },
        body: JSON.stringify({ 
          model: 'claude-haiku-4-5-20251001', 
          max_tokens: 4000, 
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: data.content[0].text },
            { role: 'user', content: "Genera EXCLUSIVAMENTE el image_prompt de 80 a 100 palabras (en inglés) siguiendo las reglas visuales de Nano Banana v5." }
          ] 
        })
      })
      const refineData: any = await refineReq.json()
      if (refineData.content) {
        parsed.image_prompt = refineData.content[0].text
      }
    }

    // 3. Generate image with Gemini
    let imageUrl = null
    if (parsed.image_prompt && process.env.GEMINI_API_KEY) {
      try {
        const refImages: any[] = []
        const refPaths = [
          path.join(__dirname, '../assets/references/ref1.jpg'), 
          path.join(__dirname, '../assets/references/ref2.jpg')
        ]
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
        console.error('[BlogController] Image generation failed:', e)
      }
    }

    // 4. Build HTML
    const htmlContent = mdToHtml(parsed.contenido || '')
    const finalHtml = imageUrl ? `<p><img src="${imageUrl}" alt="Nano Banana"></p>\n` + htmlContent : htmlContent

    // 5. Save to content table
    const userId = (req as any).user?.id
    const wordCount = (parsed.contenido || '').split(/\s+/).length
    
    const content = await ContentService.create({
      slug: ContentService.generateSlug(parsed.titulo || topic),
      title: parsed.titulo || topic,
      subtitle: parsed.subtitulo || '',
      excerpt: (parsed.contenido || '').substring(0, 200) + '...',
      markdown_content: parsed.contenido || '',
      html_content: finalHtml,
      image_url: imageUrl || undefined,
      image_prompt: parsed.image_prompt || '',
      content_type: 'blog_post',
      source: 'ai_generated',
      destination: destination || 'web',
      user_id: userId,
      word_count: wordCount,
      tone: finalTone,
      length_target: finalLength,
      status: 'draft'
    })

    // 6. Return result
    res.json({
      id: content.id,
      titulo: parsed.titulo || '',
      subtitulo: parsed.subtitulo || '',
      contenido: finalHtml,
      contenido_raw: parsed.contenido || '',
      imageUrl,
      image_prompt: parsed.image_prompt || '',
      slug: content.slug,
      usage: data.usage
    })

  } catch (error: any) {
    console.error('Error in generateBlog:', error)
    res.status(500).json({ error: error.message || 'Error calling AI API' })
  }
}

/**
 * Get content stats by type from content table
 */
export const getContentStats = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query

    let query = supabase
      .from('content')
      .select('content_type, status, created_at, published_at')

    const { data: allContent, error } = await query

    if (error) throw error

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let content = allContent || []

    const allFiltered = content

    if (year && month) {
      const y = Number(year)
      const m = Number(month) - 1
      content = content.filter(c => {
        const d = new Date(c.created_at || c.published_at)
        return d.getFullYear() === y && d.getMonth() === m
      })
    }

    const stats = {
      total: allFiltered.length,
      month_total: year && month ? content.length : undefined,
      by_type: {
        blog_post: allFiltered.filter(c => c.content_type === 'blog_post').length,
        newsletter: allFiltered.filter(c => c.content_type === 'newsletter').length,
        linkedin_post: allFiltered.filter(c => c.content_type === 'linkedin_post').length,
        note: allFiltered.filter(c => c.content_type === 'note').length,
      },
      by_type_month: year && month ? {
        blog_post: content.filter(c => c.content_type === 'blog_post').length,
        newsletter: content.filter(c => c.content_type === 'newsletter').length,
        linkedin_post: content.filter(c => c.content_type === 'linkedin_post').length,
        note: content.filter(c => c.content_type === 'note').length,
      } : undefined,
      by_status: {
        published: allFiltered.filter(c => c.status === 'published').length,
        draft: allFiltered.filter(c => c.status === 'draft').length,
        scheduled: allFiltered.filter(c => c.status === 'scheduled').length,
      },
      recent_30d: allFiltered.filter(c => {
        const d = new Date(c.created_at || c.published_at)
        return d >= thirtyDaysAgo
      }).length,
      recent_7d: allFiltered.filter(c => {
        const d = new Date(c.created_at || c.published_at)
        return d >= sevenDaysAgo
      }).length,
    }

    res.json(stats)
  } catch (error: any) {
    console.error('[BlogController] Error en getContentStats:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get content items for calendar and dashboard (lightweight)
 */
export const getContentItems = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query

    let query = supabase
      .from('content')
      .select('id, title, content_type, status, created_at, published_at, destination, word_count')
      .order('created_at', { ascending: false })
      .limit(500)

    const { data, error } = await query

    if (error) throw error

    let items = data || []

    if (year && month) {
      const y = Number(year)
      const m = Number(month) - 1
      items = items.filter(i => {
        const d = new Date(i.created_at || i.published_at)
        return d.getFullYear() === y && d.getMonth() === m
      })
    }

    res.json(items)
  } catch (error: any) {
    console.error('[BlogController] Error en getContentItems:', error)
    res.status(500).json({ error: error.message })
  }
}

const BOT_PATTERN = /bot|crawl|spider|slurp|mediapartners|feedly|rss|baiduspider|yandex|sogou|exabot|ia_archiver|facebookexternalhit|curl|wget|python|java\/|ruby|go-http|headlesschrome|puppeteer|semrush|ahrefs|mj12bot|dotbot|zoominfobot|seznambot|opensiteexplorer|bytespider|gptbot|chatgpt-user|ccbot|claudebot|anthropic|applebot|bingpreview/i
const isBotUa = (ua: string) => BOT_PATTERN.test(ua || '')

/**
 * Get aggregated dashboard stats with analytics for a given month
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const y = Number(req.query.year) || new Date().getFullYear()
    const m = Number(req.query.month) || (new Date().getMonth() + 1)
    const monthStart = new Date(y, m - 1, 1).toISOString()
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999).toISOString()

    const { data: monthContent, error: cErr } = await supabase
      .from('content')
      .select('id, content_type, status, created_at, published_at, destination, word_count, title')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)
      .order('created_at', { ascending: false })

    if (cErr) throw cErr

    const content = monthContent || []
    const contentIds = content.map(c => c.id)

    // --- WEB analytics from post_events ---
    let webViews = 0
    let webVisitors = 0
    let webShares = 0
    let webCta = 0
    let webSubscribes = 0
    let totalScrollDepth = 0
    let scrollVisitors = 0

    if (contentIds.length > 0) {
      const { data: events } = await supabase
        .from('post_events')
        .select('content_id, event_type, visitor_id, user_agent, metadata')

      const humanEvents = (events || []).filter(e => !isBotUa(e.user_agent))
      const monthContentIds = new Set(contentIds)
      const monthEvents = humanEvents.filter(e => monthContentIds.has(e.content_id))

      for (const e of monthEvents) {
        if (e.event_type === 'page_view') webViews++
        if (e.event_type === 'share_click') webShares++
        if (e.event_type === 'cta_click') webCta++
        if (e.event_type === 'subscribe_submit') webSubscribes++
        if (e.event_type === 'scroll_depth') {
          totalScrollDepth += e.metadata?.depth_percent || 0
          scrollVisitors++
        }
      }
      webVisitors = new Set(monthEvents.filter(e => e.event_type === 'page_view').map(e => e.visitor_id)).size
    }

    // --- SUBSTACK analytics from posts table ---
    let substackViews = 0
    let substackLikes = 0
    let substackOpenRates: number[] = []

    const { data: subPosts } = await supabase
      .from('posts')
      .select('post_id, title, views, open_rate, reaction_count, published_at, post_type')

    const monthSubPosts = (subPosts || []).filter((p: any) => {
      if (!p.published_at) return false
      const d = new Date(p.published_at)
      return d.getFullYear() === y && d.getMonth() === m - 1
    })

    for (const p of monthSubPosts) {
      substackViews += p.views || 0
      substackLikes += p.reaction_count || 0
      if (p.open_rate && p.open_rate > 0) substackOpenRates.push(p.open_rate)
    }

    const substackAvgOpen = substackOpenRates.length > 0
      ? substackOpenRates.reduce((a, b) => a + b, 0) / substackOpenRates.length
      : 0

    // --- Aggregate ---
    const totalViews = webViews + substackViews
    const totalVisitors = webVisitors + (monthSubPosts.length || 0)
    const totalLikes = substackLikes
    const avgScrollDepth = scrollVisitors > 0 ? Math.round(totalScrollDepth / scrollVisitors) : 0

    const byType: Record<string, number> = {}
    content.forEach(c => { byType[c.content_type] = (byType[c.content_type] || 0) + 1 })

    const byStatus: Record<string, number> = {}
    content.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1 })

    const analyticsByType: Record<string, { views: number; visitors: number; shares: number; likes: number; open_rate: number; content_count: number }> = {}

    // Blog (web)
    const blogContent = content.filter(c => c.content_type === 'blog_post')
    analyticsByType.blog_post = {
      views: webViews,
      visitors: webVisitors,
      shares: webShares,
      likes: 0,
      open_rate: 0,
      content_count: blogContent.length,
    }

    // Newsletter (substack)
    analyticsByType.newsletter = {
      views: substackViews,
      visitors: monthSubPosts.length,
      shares: 0,
      likes: substackLikes,
      open_rate: Math.round(substackAvgOpen * 100) / 100,
      content_count: monthSubPosts.length,
    }

    // LinkedIn
    const linkedinContent = content.filter(c => c.content_type === 'linkedin_post')
    analyticsByType.linkedin_post = {
      views: 0,
      visitors: 0,
      shares: 0,
      likes: 0,
      open_rate: 0,
      content_count: linkedinContent.length,
    }

    // Notes
    const notesContent = content.filter(c => c.content_type === 'note')
    analyticsByType.note = {
      views: 0,
      visitors: 0,
      shares: 0,
      likes: 0,
      open_rate: 0,
      content_count: notesContent.length,
    }

    res.json({
      period: { year: y, month: m },
      content: {
        total: content.length,
        by_type: byType,
        by_status: byStatus,
        items: content,
      },
      analytics: {
        views: totalViews,
        unique_visitors: totalVisitors,
        shares: webShares,
        cta_clicks: webCta,
        subscribes: webSubscribes,
        avg_scroll_depth: avgScrollDepth,
        scroll_visitors: scrollVisitors,
        likes: totalLikes,
        avg_open_rate: Math.round(substackAvgOpen * 100) / 100,
      },
      analytics_by_type: analyticsByType,
    })
  } catch (error: any) {
    console.error('[BlogController] Error en getDashboardStats:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * List blog posts from content table
 */
export const listBlogPosts = async (req: Request, res: Response) => {
  try {
    const { destination, status, limit, offset } = req.query
    
    const result = await ContentService.list({
      content_type: 'blog_post',
      destination: destination as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0
    })
    
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get blog post by ID or slug
 */
export const getBlogPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const content = await ContentService.getById(id)
    res.json(content)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Update blog post
 */
export const updateBlogPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body
    const content = await ContentService.update(id, updates)
    res.json(content)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Delete blog post
 */
export const deleteBlogPost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await ContentService.delete(id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get analytics for a blog post
 */
export const getBlogAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const analytics = await ContentService.getAnalytics(id)
    res.json(analytics)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get analytics summary
 */
export const getAnalyticsSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id
    const summary = await ContentService.getAnalyticsSummary(userId)
    res.json(summary)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get web blog posts with analytics from post_events
 */
export const getWebPosts = async (req: Request, res: Response) => {
  try {
    const { limit = 25, offset = 0, status = 'published' } = req.query

    const { data: posts, error, count: total } = await supabase
      .from('content')
      .select('*', { count: 'exact' })
      .eq('content_type', 'blog_post')
      .eq('status', status)
      .order('published_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    if (error) throw error

    const isBot = isBotUa

    // Get analytics for each post from post_events
    const postsWithAnalytics = await Promise.all((posts || []).map(async (post: any) => {
      const { data: events } = await supabase
        .from('post_events')
        .select('event_type, visitor_id, user_agent')
        .eq('content_id', post.id)

      const humanEvents = (events || []).filter(e => !isBot(e.user_agent))

      const views = humanEvents.filter(e => e.event_type === 'page_view').length
      const uniqueVisitors = new Set(humanEvents.filter(e => e.event_type === 'page_view').map(e => e.visitor_id)).size
      const shareClicks = humanEvents.filter(e => e.event_type === 'share_click').length
      const ctaClicks = humanEvents.filter(e => e.event_type === 'cta_click').length
      const subscribeSubmits = humanEvents.filter(e => e.event_type === 'subscribe_submit').length

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        image_url: post.image_url,
        published_at: post.published_at,
        status: post.status,
        word_count: post.word_count,
        destination: post.destination,
        stats: {
          views,
          unique_visitors: uniqueVisitors,
          share_clicks: shareClicks,
          cta_clicks: ctaClicks,
          subscribe_submits: subscribeSubmits,
        },
        post_url: `https://transformateck.com/blog/${post.slug}`,
      }
    }))

    res.json({ posts: postsWithAnalytics, total: total || 0 })
  } catch (error: any) {
    console.error('[BlogController] Error en getWebPosts:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get web post detail with analytics
 */
export const getWebPostDetail = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params

    const { data: post, error } = await supabase
      .from('content')
      .select('*')
      .eq('id', postId)
      .eq('content_type', 'blog_post')
      .single()

    if (error || !post) return res.status(404).json({ error: 'Post no encontrado' })

    // Get analytics events
    const { data: events } = await supabase
      .from('post_events')
      .select('*')
      .eq('content_id', post.id)
      .order('recorded_at', { ascending: false })

    const humanEvents = (events || []).filter(e => !isBotUa(e.user_agent))

    const views = humanEvents.filter(e => e.event_type === 'page_view').length
    const uniqueVisitors = new Set(humanEvents.filter(e => e.event_type === 'page_view').map(e => e.visitor_id)).size
    const shareClicks = humanEvents.filter(e => e.event_type === 'share_click') || []
    const ctaClicks = humanEvents.filter(e => e.event_type === 'cta_click') || []
    const subscribeSubmits = humanEvents.filter(e => e.event_type === 'subscribe_submit').length
    const scrollDepths = humanEvents.filter(e => e.event_type === 'scroll_depth') || []

    // Share breakdown by platform
    const shareBreakdown: Record<string, number> = {}
    shareClicks.forEach(e => {
      const platform = e.metadata?.platform || 'unknown'
      shareBreakdown[platform] = (shareBreakdown[platform] || 0) + 1
    })

    // CTA breakdown
    const ctaBreakdown: Record<string, number> = {}
    ctaClicks.forEach(e => {
      const name = e.metadata?.cta_name || 'unknown'
      ctaBreakdown[name] = (ctaBreakdown[name] || 0) + 1
    })

    // Scroll depth: group by visitor, take max depth per visitor, then avg
    const visitorScrollMax: Record<string, number> = {}
    scrollDepths.forEach(e => {
      const vid = e.visitor_id || 'unknown'
      const depth = e.metadata?.depth_percent || 0
      if (!visitorScrollMax[vid] || depth > visitorScrollMax[vid]) {
        visitorScrollMax[vid] = depth
      }
    })
    const visitorScrollValues = Object.values(visitorScrollMax)
    const avgScrollDepth = visitorScrollValues.length > 0
      ? Math.round(visitorScrollValues.reduce((a, b) => a + b, 0) / visitorScrollValues.length)
      : 0
    const scrollVisitors = visitorScrollValues.length

    // Events with timestamps for timeline
    const recentEvents = humanEvents.slice(0, 20).map(e => ({
      event_type: e.event_type,
      visitor_id: e.visitor_id,
      recorded_at: e.recorded_at,
      metadata: e.metadata,
    }))

    res.json({
      ...post,
      analytics: {
        views,
        unique_visitors: uniqueVisitors,
        share_clicks: shareClicks.length,
        share_breakdown: shareBreakdown,
        cta_clicks: ctaClicks.length,
        cta_breakdown: ctaBreakdown,
        subscribe_submits: subscribeSubmits,
        scroll_visitors: scrollVisitors,
        avg_scroll_depth: avgScrollDepth,
        total_events: events?.length || 0,
      },
      recent_events: recentEvents,
      post_url: `https://transformateck.com/blog/${post.slug}`,
    })
  } catch (error: any) {
    console.error('[BlogController] Error en getWebPostDetail:', error)
    res.status(500).json({ error: error.message })
  }
}

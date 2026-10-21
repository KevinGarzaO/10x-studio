import { Request, Response } from 'express'
import fetch from 'node-fetch'
import {
  TRACKED_CAMPAIGN_DEFAULT,
  STUDIO_CAMPAIGN,
  firstSiteUrl,
  labelFromText,
  makeUtmContent,
  trackedUrl,
} from '../services/linkedin/tracked-posts'
import { supabase } from '../services/supabase.service'
import { vacancyUrl } from '../services/linkedin/vacancy-post'
import { siteUrl } from '../services/linkedin/vacancy-publisher'

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID!
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI!
const SCOPE         = 'openid profile email w_member_social'

const SITE_URL = process.env.SITE_URL || 'https://avotalent.io'

/** Migración de medición sin aplicar: el mensaje ayuda a saberlo. */
const MIGRATION_HINT = 'Falta la migración: aplica linkedin-tracked-posts-migration.sql en el SQL Editor de Supabase'

/**
 * Agrega parámetros UTM a URLs del sitio en el texto del post.
 * Una URL que ya trae utm_source (por ejemplo, un link ya etiquetado con el
 * código de una publicación) se queda como está.
 */
function addUtmToUrls(text: string): string {
  const utmParams = 'utm_source=linkedin&utm_medium=social&utm_campaign=release_1_0_0'
  return text.replace(
    /(https?:\/\/(?:avotalent\.io|avocado(?:-studio)?\.vercel\.app|community\.avotalent\.io)[^\s)]*)/gi,
    (url) => {
      if (/utm_source/i.test(url)) return url
      const separator = url.includes('?') ? '&' : '?'
      return `${url}${separator}${utmParams}`
    },
  )
}

/** GET /api/linkedin/auth — Redirect to LinkedIn OAuth */
export const linkedinAuth = (_req: Request, res: Response) => {
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`
  res.redirect(url)
}

/** GET /api/linkedin/callback — Exchange code → token, close popup */
export const linkedinCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string
  if (!code) return res.status(400).send('Missing code')

  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
    })
    const tokenData: any = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'No token received')

    const accessToken = tokenData.access_token

    // Primary: Fetch from OIDC UserInfo (Reliable for modern apps)
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const profile: any = await profileRes.json()
    
    // Optional: Try to get Headline from V2 /me (Might fail if legacy scopes are missing)
    let headline = ''
    try {
      const meRes = await fetch('https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,headline,vanityName)', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const meData: any = await meRes.json()
      if (meData.headline) {
        headline = typeof meData.headline === 'string' ? meData.headline : 
                   (meData.headline.localized ? Object.values(meData.headline.localized)[0] as string : '')
      } else if (meData.vanityName) {
        headline = `@${meData.vanityName}`
      }
    } catch (e) {
      console.warn('[LinkedIn] Optional headline fetch failed:', e)
    }

    const fullName = profile.name || (profile.given_name ? `${profile.given_name} ${profile.family_name || ''}`.trim() : 'Usuario LinkedIn')
    const photoUrl = profile.picture || ''
    const email    = profile.email || ''
    const urn      = profile.sub ? `urn:li:person:${profile.sub}` : ''

    // Persistence to linkedin_profiles
    const { data: userData } = await supabase.from('users').select('id').limit(1).single()
    const realUserId = userData?.id

    if (!realUserId) {
      console.error('[LinkedIn] No user found in "users" table to link profile')
      throw new Error('No user found in database')
    }

    const profileRecord = {
      user_id: realUserId,
      linkedin_id: profile.sub || '',
      first_name: profile.given_name || '',
      last_name: profile.family_name || '',
      headline: headline,
      photo_url: photoUrl,
      access_token: accessToken, // Store for background sync
      connected_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
      updated_at: new Date().toISOString()
    }

    try {
      await supabase.from('linkedin_profiles').upsert(profileRecord, { onConflict: 'user_id' })
    } catch (dbError) {
      console.warn('[LinkedIn] Save to linkedin_profiles failed:', dbError)
    }

    // Settings Sync
    const connectedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days
    const postMsgData = { 
      type: 'LINKEDIN_AUTH', 
      token: accessToken, 
      urn: urn, 
      name: fullName,
      photo: photoUrl,
      email: email,
      headline: headline,
      connectedAt: connectedAt,
      expiresAt: expiresAt
    };

    // Return to Frontend
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>LinkedIn Conectado</title></head>
        <body>
          <p style="font-family:sans-serif;padding:32px;color:#4ECCA3">✅ LinkedIn conectado como <strong>${fullName}</strong>. Cerrando...</p>
          <script>
            window.opener?.postMessage(${JSON.stringify(postMsgData)}, '*')
            setTimeout(() => window.close(), 1000)
          </script>
        </body>
      </html>
    `)
  } catch (e: any) {
    console.error('[LinkedIn] Callback error:', e)
    res.status(500).send(`Error: ${e.message}`)
  }
}

/** POST /api/linkedin/post — Publish a post (text + optional image) */
export const linkedinPost = async (req: Request, res: Response) => {
  const { token, urn, text, imageBase64, imageUrl, scheduledAt, title, type } = req.body
  const postText = text || title || ''
  
  try {
    const { data: userData } = await supabase.from('users').select('id').limit(1).single()
    const userId = userData?.id
    if (!userId) throw new Error('No user found in database')

    // Look up credentials from DB if not provided in body
    let authToken = token || process.env.LINKEDIN_ACCESS_TOKEN
    let authorUrn = urn || process.env.LINKEDIN_AUTHOR_URN
    if (!authToken || !authorUrn) {
      const { data: profile } = await supabase
        .from('linkedin_profiles')
        .select('access_token, linkedin_id')
        .eq('user_id', userId)
        .single()
      if (profile?.access_token) {
        authToken = authToken || profile.access_token
        authorUrn = authorUrn || `urn:li:person:${profile.linkedin_id}`
      }
    }

    // If scheduled for future, save to queue instead of publishing
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      console.log(`[LinkedIn] Programando post para: ${scheduledAt}`)
      
      const { error: schedError } = await supabase.from('scheduled_posts').insert({
        user_id: userId,
        platform: 'linkedin',
        content: { token: authToken, urn: authorUrn, text: postText, imageBase64, imageUrl },
        scheduled_at: new Date(scheduledAt).toISOString(),
        status: 'pending'
      })

      if (schedError) throw schedError
      return res.json({ success: true, scheduled: true, scheduledAt })
    }

    // Immediate publication
    console.log('[LinkedIn] Publicando post inmediato...')

    if (!authToken || !authorUrn) return res.status(400).json({ error: 'Falta token o URN de LinkedIn. Conecta tu cuenta de LinkedIn primero.' })
    if (!postText) return res.status(400).json({ error: 'El texto del post es requerido' })

    // Medición: si el post lleva un link a nuestros sitios, se etiqueta con un
    // código propio de esta publicación y queda registrada en el reporte.
    const cleanText = postText.trim()
    const destination = firstSiteUrl(cleanText)
    const utmContent = destination ? makeUtmContent(labelFromText(cleanText)) : null
    const taggedText = destination && utmContent
      ? cleanText.replace(destination, trackedUrl(destination, STUDIO_CAMPAIGN, utmContent))
      : cleanText

    const { LinkedInService } = require('../services/linkedin.service')
    const postId = await LinkedInService.publish({
      token: authToken,
      urn: authorUrn,
      text: addUtmToUrls(taggedText),
      imageBase64,
      imageUrl
    })

    console.log('[LinkedIn] Post publicado exitosamente:', postId)
    
    // Save to Internal History (Supabase)
    try {
      if (userId) {
        await supabase.from('linkedin_posts').insert({
          user_id: userId,
          post_id: postId,
          text: postText.trim(),
          likes: 0,
          comments: 0,
          shares: 0,
          published_at: new Date().toISOString(),
          synced_at: new Date().toISOString()
        })
        console.log('[LinkedIn] Post guardado en historial interno')
      }
    } catch (saveErr) {
      console.warn('[LinkedIn] Error saving to internal history:', saveErr)
    }

    // Dejar constancia en el registro de medición: nunca rompe la publicación.
    if (destination && utmContent) {
      try {
        const { error: trackError } = await supabase.from('linkedin_tracked_posts').insert({
          label: labelFromText(cleanText) || 'Publicación de LinkedIn',
          destination_url: destination,
          utm_campaign: STUDIO_CAMPAIGN,
          utm_content: utmContent,
          published_at: new Date().toISOString(),
          source: 'studio',
        })
        if (trackError) console.warn('[LinkedIn] No se registró para medición:', trackError.message)
      } catch (trackErr) {
        console.warn('[LinkedIn] No se registró para medición:', (trackErr as Error).message)
      }
    }

    res.json({ success: true, postId: postId, utmContent })
  } catch (e: any) {
    console.error('[LinkedIn] Error al crear post:', e)
    res.status(500).json({ error: e.message })
  }
}

/** GET /api/linkedin/proxy-image?url=... — Proxy image to avoid browser blocks */
export const linkedinProxyImage = async (req: Request, res: Response) => {
  const imageUrl = req.query.url as string
  if (!imageUrl) return res.status(400).send('Missing url')

  try {
    const response = await fetch(imageUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    })
    
    if (!response.ok) {
      console.error(`[LinkedIn Proxy] Failed to fetch image: ${response.status} ${response.statusText} for URL: ${imageUrl}`)
      throw new Error(`LinkedIn returned ${response.status}`)
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    
    const buffer = await response.buffer()
    res.send(buffer)
  } catch (e: any) {
    console.error('[LinkedIn Proxy] Critical Error:', e.message)
    res.status(500).send(`Error loading image: ${e.message}`)
  }
}

/** GET /api/linkedin/posts — Return internal post history from Supabase */
export const getLinkedInPosts = async (req: Request, res: Response) => {
  try {
    
    // 0. Get the real user ID
    const { data: userData } = await supabase.from('users').select('id').limit(1).single()
    const userId = userData?.id

    if (!userId) {
      return res.status(404).json({ error: 'No se encontró un usuario en el sistema' })
    }
    
    // 1. Fetch from Internal History
    const { data: posts, error } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('user_id', userId)
      .order('published_at', { ascending: false })
      .limit(20)

    if (error) throw error

    res.json({ success: true, posts: posts || [] })

  } catch (e: any) {
    console.error('[LinkedIn] Internal history fetch error:', e)
    res.status(500).json({ error: e.message })
  }
}

/** URL del reporte para copiar; nula si no hay destino válido. */
function rowTrackedUrl(row: any): string | null {
  if (!row?.destination_url || !row?.utm_content) return null
  try {
    return trackedUrl(row.destination_url, row.utm_campaign || TRACKED_CAMPAIGN_DEFAULT, row.utm_content)
  } catch {
    return null
  }
}

function migrationMissing(message: unknown): boolean {
  return /does not exist|schema cache/i.test(String(message))
}

/** URL pública del post en LinkedIn a partir del id que devuelve la API (urn:li:share:…). */
function linkedinPostUrl(id: string): string {
  const urn = id.startsWith('urn:') ? id : `urn:li:share:${id}`
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/**
 * Las filas automáticas (vacantes que el publisher publica solo) no tienen fila en
 * linkedin_tracked_posts: aquí se les agrega el título real de la vacante, la fecha
 * en que se publicó, el link al post de LinkedIn y el link etiquetado de la vacante.
 */
async function enrichAutoRows(rows: any[]): Promise<any[]> {
  const auto = rows.filter((row) => !row.label && row.utm_content)
  if (auto.length === 0) return rows

  const slugs = auto.map((row) => row.utm_content)
  const [postsRes, logRes] = await Promise.all([
    supabase.from('community_posts').select('slug, title').eq('type', 'job').in('slug', slugs),
    supabase
      .from('linkedin_vacancy_posts')
      .select('vacancy_slug, published_at, linkedin_post_id')
      .eq('status', 'published')
      .in('vacancy_slug', slugs)
      .order('published_at', { ascending: false }),
  ])

  const titles = new Map<string, string>(
    ((postsRes.data || []) as { slug: string; title: string }[]).map((post) => [post.slug, post.title])
  )
  const latest = new Map<string, { published_at: string | null; linkedin_post_id: string | null }>()
  for (const entry of (logRes.data || []) as { vacancy_slug: string; published_at: string | null; linkedin_post_id: string | null }[]) {
    if (!latest.has(entry.vacancy_slug)) latest.set(entry.vacancy_slug, entry)
  }

  const base = siteUrl()
  for (const row of auto) {
    const entry = latest.get(row.utm_content)
    row.label = titles.get(row.utm_content) || null
    if (entry?.published_at) row.published_at = entry.published_at
    if (entry?.linkedin_post_id) row.post_url = linkedinPostUrl(entry.linkedin_post_id)
    if (base && !row.tracked_url) {
      try {
        row.tracked_url = vacancyUrl(base, row.utm_content)
      } catch {
        // slug que no arma URL: se queda sin link copiable
      }
    }
  }
  return rows
}

/** GET /api/linkedin/registry — Publicaciones registradas con sus métricas (vista acquisition_by_post). */
export const getTrackedPosts = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('acquisition_by_post').select('*')

    if (error) {
      // Migración sin aplicar: la UI lo dice con calma en vez de un error rojo.
      if (migrationMissing(error.message)) return res.json({ success: true, posts: [], pendingMigration: true })
      throw error
    }

    let rows = (data || []).map((row: any) => ({ ...row }))
    try {
      rows = await enrichAutoRows(rows)
    } catch (e) {
      // Cosmético: el reporte se sirve igual aunque falle el cruce con vacantes.
      console.warn('[LinkedIn] No se pudieron enriquecer las filas automáticas:', e)
    }

    const posts = rows.map((row: any) => ({ ...row, tracked_url: rowTrackedUrl(row) || row.tracked_url || null }))
    res.json({ success: true, posts })
  } catch (e: any) {
    console.error('[LinkedIn] Registry fetch error:', e)
    res.status(500).json({ error: e.message })
  }
}

/** POST /api/linkedin/registry — Registra una publicación y devuelve su link etiquetado. */
export const createTrackedPost = async (req: Request, res: Response) => {
  try {

    const label = String(req.body?.label ?? '').trim()
    const destinationUrl = String(req.body?.destinationUrl ?? '').trim()
    const campaign = String(req.body?.campaign ?? '').trim() || TRACKED_CAMPAIGN_DEFAULT
    const postUrl = String(req.body?.postUrl ?? '').trim() || null
    const publishedAtRaw = req.body?.publishedAt

    if (!label) return res.status(400).json({ error: 'El título de la publicación es requerido' })

    let destination: URL
    try {
      destination = new URL(destinationUrl)
    } catch {
      return res.status(400).json({ error: 'La URL destino no es válida' })
    }
    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      return res.status(400).json({ error: 'La URL destino debe empezar con http:// o https://' })
    }

    let publishedAt: string | null = null
    if (publishedAtRaw) {
      const date = new Date(publishedAtRaw)
      if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'La fecha de publicación no es válida' })
      publishedAt = date.toISOString()
    }

    // El código lleva aleatorio: si chocara con uno existente, se reintenta con otro.
    let row: any = null
    let lastError: any = null
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      const { data, error } = await supabase.from('linkedin_tracked_posts').insert({
        label,
        destination_url: destination.toString(),
        utm_campaign: campaign,
        utm_content: makeUtmContent(label),
        post_url: postUrl,
        published_at: publishedAt,
        source: 'manual',
      }).select().single()

      if (error) {
        lastError = error
        if (/duplicate|unique/i.test(error.message)) continue
        break
      }
      row = data
    }

    if (!row) {
      const message = String(lastError?.message ?? 'No se pudo registrar la publicación')
      if (/linkedin_tracked_posts/.test(message) && migrationMissing(message)) {
        return res.status(500).json({ error: MIGRATION_HINT })
      }
      throw lastError
    }

    res.status(201).json({ success: true, post: { ...row, tracked_url: rowTrackedUrl(row) } })
  } catch (e: any) {
    console.error('[LinkedIn] Registry create error:', e)
    res.status(500).json({ error: e.message })
  }
}

/** DELETE /api/linkedin/registry/:id — Quita una publicación del registro. */
export const deleteTrackedPost = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Id inválido' })

    const { error } = await supabase.from('linkedin_tracked_posts').delete().eq('id', id)

    if (error) {
      if (/linkedin_tracked_posts/.test(error.message) && migrationMissing(error.message)) {
        return res.status(500).json({ error: MIGRATION_HINT })
      }
      throw error
    }

    res.json({ success: true })
  } catch (e: any) {
    console.error('[LinkedIn] Registry delete error:', e)
    res.status(500).json({ error: e.message })
  }
}

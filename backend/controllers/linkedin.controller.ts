import { Request, Response } from 'express'
import fetch from 'node-fetch'

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID!
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI!
const SCOPE         = 'openid profile email w_member_social'

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
    const { supabase } = require('../services/supabase.service')
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
      updated_at: new Date().toISOString()
    }

    try {
      await supabase.from('linkedin_profiles').upsert(profileRecord, { onConflict: 'user_id' })
    } catch (dbError) {
      console.warn('[LinkedIn] Save to linkedin_profiles failed:', dbError)
    }

    // Settings Sync
    const postMsgData = { 
      type: 'LINKEDIN_AUTH', 
      token: accessToken, 
      urn: urn, 
      name: fullName,
      photo: photoUrl,
      email: email,
      headline: headline
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
    const { supabase } = require('../services/supabase.service')
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

    const { LinkedInService } = require('../services/linkedin.service')
    const postId = await LinkedInService.publish({
      token: authToken,
      urn: authorUrn,
      text: postText.trim(),
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

    res.json({ success: true, postId: postId })
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
    const { supabase } = require('../services/supabase.service')
    
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

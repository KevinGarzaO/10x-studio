import { supabase } from './supabase.service'
import fetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'

export class SubstackService {
  static async getCookieHeader(userId: string): Promise<string> {
    console.log(`[getCookieHeader] Buscando cookies para user_id: ${userId}`)
    const { data: cookies } = await supabase
      .from('cookies')
      .select('substack_sid, substack_lli, visit_id, cf_clearance, cf_bm, ab_testing_id, cookie_storage_key')
      .eq('user_id', userId)
      .single()

    if (!cookies) {
      console.warn('[getCookieHeader] No se encontraron cookies en la tabla.')
      return ''
    }

    const parts = []
    if (cookies.substack_sid) parts.push(`substack.sid=${cookies.substack_sid}`)
    if (cookies.substack_lli) parts.push(`substack.lli=${cookies.substack_lli}`)
    if (cookies.visit_id) parts.push(`visit_id=${cookies.visit_id}`)
    if (cookies.cf_clearance) parts.push(`cf_clearance=${cookies.cf_clearance}`)
    if (cookies.cf_bm) parts.push(`__cf_bm=${cookies.cf_bm}`)
    if (cookies.ab_testing_id) parts.push(`ab_testing_id=${cookies.ab_testing_id}`)
    if (cookies.cookie_storage_key) parts.push(`cookie_storage_key=${cookies.cookie_storage_key}`)

    console.log(`[getCookieHeader] Cookies construidas con ${parts.length} variables. Nombres:`, Object.keys(cookies).filter(k => cookies[k as keyof typeof cookies]))
    return parts.join('; ')
  }

  static getHeaders(cookie: string, origin = 'https://substack.com') {
    return {
      'Cookie': cookie,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': origin,
      'Referer': `${origin}/`,
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    }
  }

  static async syncProfile(userId: string, substackUserId: string, substackSlug: string) {
    const cookie = await this.getCookieHeader(userId)
    if (!cookie) throw new Error('No cookies found')

    const url = `https://substack.com/api/v1/user/${substackUserId}-${substackSlug}/public_profile/self`
    const res = await fetch(url, { headers: this.getHeaders(cookie) })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status} para ${url}`)
    const profile = await res.json()
    console.log('[DEBUG] Substack API Profile Response:', { 
      id: profile.id, 
      name: profile.name, 
      handle: profile.handle, 
      primaryPub: profile.primaryPublication?.name 
    })

    // 1. Guardar perfil en tabla 'users'
    const userData = {
    substack_user_id: profile.id,
    substack_slug: `${profile.id}-${profile.handle}`,
    name: profile.name,
    handle: profile.handle,
    photo_url: profile.photo_url,
    bio: profile.bio,
    subscriber_count: profile.subscriberCountNumber,
    follower_count: profile.followerCount,
    subdomain: profile.primaryPublication?.subdomain || '',
    publication_id: String(profile.primaryPublication?.id || ''),
    updated_at: new Date().toISOString()
  }

  const { error: userErr, data: updatedUser } = await supabase
    .from('users')
    .upsert(userData, { onConflict: 'substack_user_id' })
    .select('id')
    .single()
  if (userErr) console.error('[Substack] Error upsert users:', userErr)

const resolvedUserId = updatedUser?.id || userId

    // 2. Guardar publicación en tabla 'publications'
    if (profile.primaryPublication) {
      const pubData = {
        id: String(profile.primaryPublication.id),              // Using 'id' instead of 'publication_id'
        user_id: resolvedUserId,                                        // Link to 'users' table
        name: profile.primaryPublication.name,                  // "Transformateck"
        subdomain: profile.primaryPublication.subdomain,        // "transformateck"
        logo_url: profile.primaryPublication.logo_url,          // URL del logo
        role: 'admin',                                          // Default role
        is_primary: true,                                       // Mark as primary
        subscriber_count: profile.subscriberCountNumber || 0,   // "269"
        synced_at: new Date().toISOString()
      }

      const { error: pubErr } = await supabase.from('publications').upsert(pubData, { onConflict: 'id' })
      if (pubErr) console.error('[Substack] Error upsert publications:', pubErr)
    }
    
    return { profile }
  }

  static async syncPosts(userId: string, subdomain: string) {
    const cookie = await this.getCookieHeader(userId)
    if (!cookie) throw new Error('No cookies found')

    const url = `https://${subdomain}.substack.com/api/v1/post_management/published?offset=0&limit=25&order_by=post_date&order_direction=desc`
    const res = await fetch(url, { headers: this.getHeaders(cookie, `https://${subdomain}.substack.com`) })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    
    const posts = await res.json()
    const postsArray = Array.isArray(posts) ? posts : (posts.posts || [])

    const postsToUpsert = postsArray.map((p: any) => ({
      user_id: userId,
      post_id: String(p.id),
      title: p.title,
      subtitle: p.subtitle,
      cover_image_url: p.cover_image,
      published_at: p.post_date,
      audience: p.audience || 'everyone',
      is_published: true,
      synced_at: new Date().toISOString()
    }))

    if (postsToUpsert.length > 0) {
      await supabase.from('posts').upsert(postsToUpsert, { onConflict: 'user_id,post_id' })
    }
    return postsToUpsert
  }

  static async syncStats(userId: string, subdomain: string) {
    const cookie = await this.getCookieHeader(userId)
    if (!cookie) throw new Error('No cookies found')

    const url = `https://${subdomain}.substack.com/api/v1/subscriber-stats`
    const res = await fetch(url, { 
      method: 'POST',
      headers: this.getHeaders(cookie, `https://${subdomain}.substack.com`),
      body: JSON.stringify({})
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    
    const statsData = await res.json()
    const subscriberCount = statsData.count ?? statsData.chartCounts?.totalEmail ?? 0
    const followerCount = statsData.follower_count ?? 0

    const newStat = {
      user_id: userId,
      subscriber_count: subscriberCount,
      follower_count: followerCount,
      date: new Date().toISOString().split('T')[0]
    }

    await supabase.from('stats').upsert(newStat, { onConflict: 'user_id,date' })
    
    // Also update user summary
    await supabase.from('users').update({ subscriber_count: subscriberCount }).eq('id', userId)

    return newStat
  }

  static async syncSubscribers(userId: string, subdomain: string) {
    const cookie = await this.getCookieHeader(userId)
    if (!cookie) throw new Error('No cookies found')

    console.log(`[Substack] Iniciando sync de subscriptores para ${subdomain}...`)
    let allSubscribers: any[] = []
    const limit = 100
    let offset = 0
    const seenIds = new Set<number>()

    while (true) {
      const url = `https://${subdomain}.substack.com/api/v1/subscriber-stats`
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(cookie, `https://${subdomain}.substack.com`),
        body: JSON.stringify({
          limit,
          offset,
          order_by: 'subscription_created_at',
          order_direction: 'asc'
        })
      })
      
      if (!res.ok) {
        console.error(`[Substack] Error fetching subscribers at offset ${offset}: ${res.status}`)
        break
      }
      
      const data = await res.json()
      console.log('[DEBUG subscribers] Status:', res.status)
      console.log('[DEBUG subscribers] Data keys:', Object.keys(data))
      console.log('[DEBUG subscribers] Sample:', JSON.stringify(data).slice(0, 500))
      
      const subs = data?.subscribers || []
      const totalReported = data.total_count || (subs.length > 0 ? subs[0]?.total_count : null) || data.count || '?'
      
      console.log(`[Substack] Offset ${offset}: Obtenidos ${subs.length} subs de un total reportado de ${totalReported}`)
      if (subs.length === 0) break
      
      // Deduplicar por subscription_id
      for (const sub of subs) {
        if (!seenIds.has(sub.subscription_id)) {
          seenIds.add(sub.subscription_id)
          allSubscribers.push(sub)
        }
      }
      
      if (subs.length < limit) break
      offset += limit
      
      // Safety break to avoid infinite loops if API behaves weirdly
      if (offset > 50000) break 
    }

    if (allSubscribers.length > 0) {
      console.log(`[Substack] Procesando ${allSubscribers.length} subscriptores para Supabase...`)
      console.log(`[Substack] Sample subscriber keys:`, Object.keys(allSubscribers[0]))
      const subsToUpsert = allSubscribers.map((s: any) => ({
        user_id: userId,
        email: s.user_email_address || s.email,
        name: s.user_name || s.name || '',
        type: s.subscription_interval || s.subscription_type || 'free',
        created_at: s.subscription_created_at || s.created_at || new Date().toISOString(),
        country: s.country || '',
        active: s.active !== false && s.is_subscribed !== false,
        stars: s.activity_rating ?? s.engagement_stars ?? null,
        opens7d: s.email_opens_7d ?? null,
        opens30d: s.email_opens_30d ?? null,
        opens6m: s.email_opens_180d ?? null,
        revenue: s.total_revenue_generated != null ? s.total_revenue_generated : (s.revenue_cents != null ? s.revenue_cents / 100 : null),
        source: s.source ?? '',
        synced_at: new Date().toISOString()
      }))

      console.log(`[Substack] First sub to upsert:`, JSON.stringify(subsToUpsert[0]))
      
      // Eliminar duplicados por email antes de hacer upsert
      const uniqueSubs = subsToUpsert.filter(
        (sub, index, self) => index === self.findIndex(s => s.email === sub.email)
      )

      const { error } = await supabase.from('subscribers').upsert(uniqueSubs, { onConflict: 'user_id,email' })
      if (error) {
        console.error('[Supabase] Error upserting subscribers:', JSON.stringify(error))
        throw new Error(`Error al guardar subscriptores: ${error.message}`)
      }
      console.log(`[Substack] Sync de subscriptores completado con éxito: ${uniqueSubs.length} guardados (de ${allSubscribers.length} recibidos).`)
    } else {
      console.log('[Substack] No se encontraron subscriptores para sincronizar.')
    }
    
    return allSubscribers.length
  }


  static async createDraft(userId: string, params: any) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain, substack_user_id').eq('id', userId).single()
    if (!user) throw new Error('User not found')
    
    const subdomain = user.subdomain
    const bylineId = Number(user.substack_user_id || 0)
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/drafts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        draft_title: '',
        draft_subtitle: '',
        draft_body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] }),
        draft_bylines: [{ id: bylineId, is_guest: false }],
        audience: 'everyone',
        type: 'newsletter',
        ...params
      }),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
  }

  static async updateDraft(userId: string, draftId: string, params: any) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain, substack_user_id').eq('id', userId).single()
    if (!user) throw new Error('User not found')
    
    const subdomain = user.subdomain
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    if (params.draft_body) {
      try {
        let astObj = typeof params.draft_body === 'string' ? JSON.parse(params.draft_body) : params.draft_body;
        astObj = this.injectSubstackSchema(astObj);
        params.draft_body = JSON.stringify(astObj); // Must be explicitly encoded as a string for Substack PUT payload
      } catch (e) {
        console.error('[Substack] Error injectSubstackSchema in updateDraft', e);
      }
    }
    
    // Explicitly inject required schema fields for strict update parsing
    params.draft_bylines = [{ id: Number(user.substack_user_id), is_guest: false }];

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/drafts/${draftId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(params),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
  }

  static async scheduleDraft(userId: string, draftId: string, scheduleAt: string) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain').eq('id', userId).single()
    if (!user) throw new Error('User not found')
    
    const subdomain = user.subdomain
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/drafts/${draftId}/scheduled_release`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        trigger_at: new Date(scheduleAt).toISOString(),
        post_audience: 'everyone',
      }),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
  }

  static async addSubscriber(userId: string, email: string) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('publication_id, subdomain').eq('id', userId).single()
    if (!user) throw new Error('User not found')
    
    const pubId = user.publication_id
    const subdomain = user.subdomain
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    const res = await fetch(`https://substack.com/api/v1/publication/${pubId}/subscribers/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscribers: [{ email }] }),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
  }

  static async publishNote(userId: string, content: string) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain').eq('id', userId).single()
    const subdomain = user?.subdomain || 'transformateck'

    const headers = {
      'Cookie': cookie,
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Origin': `https://${subdomain}.substack.com`,
      'Referer': `https://${subdomain}.substack.com/publish/home?utm_source=menu`,
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sec-gpc': '1',
      'pragma': 'no-cache',
      'cache-control': 'no-cache'
    }

    const bodyJson = {
      type: "doc",
      attrs: { schemaVersion: "v1" },
      content: [{ type: "paragraph", content: [{ type: "text", text: content }] }]
    }

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/comment/feed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ bodyJson, replyMinimumRole: "everyone" })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Substack API error: ${res.status} - ${text}`)
    }
    return await res.json()
  }

  static async uploadImage(userId: string, imageBase64: string, postId: string) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain').eq('id', userId).single()
    if (!user) throw new Error('User not found')
    
    const subdomain = user.subdomain
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image: imageBase64, postId: Number(postId) }),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
  }

  static injectSubstackSchema(node: any): any {
    if (!node) return node;
    
    // Substack's strict ProseMirror schema enforces `textAlign: null` explicitly on headings/paragraphs without a default fallback. 
    // TipTap natively drops null attributes, which causes Substack's parser to throw Schema Validation exceptions and fallback to string wrappers.
    if (node.type === 'paragraph' || node.type === 'heading') {
      if (!node.attrs) {
        node.attrs = {};
      }
      if (node.attrs.textAlign === undefined) {
        node.attrs.textAlign = null;
      }
    }

    if (node.type === 'image') {
      // Map standard TipTap image to Substack captionedImage schema
      return {
        type: 'captionedImage',
        content: [
          {
            type: 'image2',
            attrs: {
              src: node.attrs?.src || '',
              height: node.attrs?.height || null,
              width: node.attrs?.width || null,
              bytes: node.attrs?.bytes || null,
              type: node.attrs?.fileType || 'image/png'
            }
          }
        ]
      }
    }

    if (node.type === 'image') {
      // Map standard TipTap image to Substack captionedImage schema
      return {
        type: 'captionedImage',
        content: [
          {
            type: 'image2',
            attrs: {
              src: node.attrs?.src || '',
              height: node.attrs?.height || null,
              width: node.attrs?.width || null,
              bytes: node.attrs?.bytes || null,
              type: node.attrs?.fileType || 'image/png',
              srcNoWatermark: null,
              fullscreen: null,
              imageSize: null,
              resizeWidth: null,
              alt: null,
              title: null,
              href: null,
              belowTheFold: false,
              topImage: false,
              isProcessing: false,
              align: null,
              offset: false
            }
          }
        ]
      }
    }

    if (node.type === 'subscribe_widget') {
      return {
        type: 'subscribeWidget',
        attrs: {
          url: "%%checkout_url%%",
          text: "Suscribirse",
          language: "es"
        },
        content: [
          {
            type: 'ctaCaption',
            content: [
              {
                type: 'text',
                text: "¡Gracias por leer Transformateck! Suscríbete gratis para recibir nuevas publicaciones y apoyar mi trabajo."
              }
            ]
          }
        ]
      }
    }


    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map((child: any) => this.injectSubstackSchema(child));
    }

    return node;
  }

  static async publishArticle(userId: string, title: string, content: string, subtitle = '', scheduleAt: string | null = null, draftId?: string) {
    // 1. Create Empty Draft with strictly compliant default schema if not pre-initialized
    if (!draftId) {
      const draft = await this.createDraft(userId, {
        draft_title: title.trim(),
        draft_subtitle: subtitle.trim(),
      })
      draftId = String(draft.id)
    }

    // 2. Put explicitly modeled ProseMirror JSON string over native editor Autosave endpoint
    await this.updateDraft(userId, String(draftId), {
      draft_title: title.trim(),
      draft_subtitle: subtitle.trim(),
      draft_podcast_url: null,
      draft_podcast_duration: null,
      draft_body: content,
      section_chosen: false,
      draft_section_id: null,
      audience: 'everyone',
      type: 'newsletter'
    })

    // 3. Schedule
    const triggerAt = scheduleAt
      ? new Date(scheduleAt).toISOString()
      : new Date(Date.now() + 10_000).toISOString()

    return await this.scheduleDraft(userId, String(draftId), triggerAt)
  }
}

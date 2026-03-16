import { supabase } from './supabase.service'
import fetch from 'node-fetch'

export class SubstackService {
  static async getCookieHeader(userId: string): Promise<string> {
    const { data: cookies } = await supabase
      .from('cookies')
      .select('substack_sid, substack_lli, visit_id')
      .eq('user_id', userId)
      .single()

    if (!cookies) return ''

    const parts = []
    if (cookies.substack_sid) parts.push(`substack.sid=${cookies.substack_sid}`)
    if (cookies.substack_lli) parts.push(`substack.lli=${cookies.substack_lli}`)
    if (cookies.visit_id) parts.push(`visit_id=${cookies.visit_id}`)

    return parts.join('; ')
  }

  static getHeaders(cookie: string, origin = 'https://substack.com') {
    return {
      'Cookie': cookie,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': origin,
      'Referer': `${origin}/`
    }
  }

  static async syncProfile(userId: string, substackUserId: string, substackSlug: string) {
    const cookie = await this.getCookieHeader(userId)
    if (!cookie) throw new Error('No cookies found')

    const url = `https://substack.com/api/v1/user/${substackUserId}-${substackSlug}/public_profile/self`
    const res = await fetch(url, { headers: this.getHeaders(cookie) })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status} para ${url}`)
    
    const profile = await res.json()
    
    const updatedUser: any = {
      name: profile.name || profile.display_name,
      handle: profile.handle,
      photo_url: profile.photo_url || profile.profile_photo_url,
      bio: profile.bio,
      substack_slug: profile.slug,
      publication_id: String(profile.primaryPublication?.id || ''),
      subdomain: profile.primaryPublication?.subdomain || '',
      subscriber_count: profile.subscriberCountNumber || profile.primaryPublication?.subscriber_count || 0,
      updated_at: new Date().toISOString()
    }

    const extraFields: any = {
      follower_count: profile.followerCount || 0,
      publication_logo: profile.primaryPublication?.logo_url,
      hero_text: profile.primaryPublication?.hero_text,
      social_links: profile.userLinks || []
    }

    await supabase.from('users').update({ ...updatedUser, ...extraFields }).eq('id', userId)
    
    return { ...updatedUser, ...extraFields }
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
    let offset = 0
    const limit = 100

    while (true) {
      const url = `https://${subdomain}.substack.com/api/v1/subscriber-list?limit=${limit}&offset=${offset}&order_by=created_at&order_direction=desc`
      const res = await fetch(url, { headers: this.getHeaders(cookie, `https://${subdomain}.substack.com`) })
      
      if (!res.ok) {
        console.error(`[Substack] Error fetching subscribers at offset ${offset}: ${res.status}`)
        break
      }
      
      const data = await res.json()
      const subs = data.subscribers || []
      console.log(`[Substack] Offset ${offset}: Obtenidos ${subs.length} subs`)
      if (subs.length === 0) break
      
      allSubscribers = allSubscribers.concat(subs)
      if (subs.length < limit) break
      offset += limit
      
      // Safety break to avoid infinite loops if API behaves weirdly
      if (offset > 50000) break 
    }

    if (allSubscribers.length > 0) {
      console.log(`[Substack] Procesando ${allSubscribers.length} subscriptores para Supabase...`)
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

      const { error } = await supabase.from('subscribers').upsert(subsToUpsert, { onConflict: 'user_id,email' })
      if (error) {
        console.error('[Supabase] Error upserting subscribers:', error)
        throw new Error(`Error al guardar subscriptores: ${error.message}`)
      }
      console.log(`[Substack] Sync de subscriptores completado con éxito: ${allSubscribers.length} guardados.`)
    } else {
      console.log('[Substack] No se encontraron subscriptores para sincronizar.')
    }
    
    return allSubscribers.length
  }

  static async publishNote(userId: string, content: string) {
    const cookie = await this.getCookieHeader(userId)
    const { data: user } = await supabase.from('users').select('subdomain').eq('id', userId).single()
    const subdomain = user?.subdomain || 'transformateck'
    const headers = this.getHeaders(cookie, `https://${subdomain}.substack.com`)

    const bodyJson = {
      type: "doc",
      attrs: { schemaVersion: "v1" },
      content: [{ type: "paragraph", content: [{ type: "text", text: content }] }]
    }

    const res = await fetch(`https://${subdomain}.substack.com/api/v1/comment/feed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ bodyJson, replyMinimumRole: "everyone" }),
    })
    
    if (!res.ok) throw new Error(`Substack API error: ${res.status}`)
    return await res.json()
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
        draft_body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
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

  static mdToProseMirror(md: string): any[] {
    const nodes: any[] = []
    for (const line of md.split('\n')) {
      const clean = line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
      if (!line.trim()) {
        nodes.push({ type: 'paragraph', attrs: { textAlign: null } })
      } else if (line.startsWith('# ')) {
        nodes.push({ type: 'heading', attrs: { level: 1, id: null }, content: [{ type: 'text', text: line.replace(/^# /, '') }] })
      } else if (line.startsWith('## ')) {
        nodes.push({ type: 'heading', attrs: { level: 2, id: null }, content: [{ type: 'text', text: line.replace(/^## /, '') }] })
      } else if (line.startsWith('### ')) {
        nodes.push({ type: 'heading', attrs: { level: 3, id: null }, content: [{ type: 'text', text: line.replace(/^### /, '') }] })
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        nodes.push({
          type: 'bullet_list',
          content: [{
            type: 'list_item',
            content: [{
              type: 'paragraph',
              attrs: { textAlign: null },
              content: [{ type: 'text', text: clean.replace(/^[-*] /, '') }],
            }],
          }],
        })
      } else {
        nodes.push({ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: clean }] })
      }
    }
    return nodes
  }

  static async publishArticle(userId: string, title: string, content: string, subtitle = '', scheduleAt: string | null = null) {
    // 1. Create Draft
    const draft = await this.createDraft(userId, {
      draft_title: title.trim(),
      draft_subtitle: subtitle.trim(),
      draft_body: JSON.stringify({ type: 'doc', content: this.mdToProseMirror(content) })
    })

    const draftId = draft.id

    // 2. Schedule
    const triggerAt = scheduleAt
      ? new Date(scheduleAt).toISOString()
      : new Date(Date.now() + 10_000).toISOString()

    return await this.scheduleDraft(userId, String(draftId), triggerAt)
  }
}

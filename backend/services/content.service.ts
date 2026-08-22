import { supabase } from './supabase.service'

export interface ContentItem {
  id?: string
  slug: string
  title: string
  subtitle?: string
  excerpt?: string
  markdown_content?: string
  html_content?: string
  image_url?: string
  image_prompt?: string
  content_type: 'blog_post' | 'newsletter' | 'linkedin_post' | 'note'
  source: 'ai_generated' | 'user_created' | 'migrated'
  destination: 'substack' | 'web' | 'wordpress' | 'linkedin'
  topic_id?: string
  user_id?: string
  word_count?: number
  tone?: string
  length_target?: string
  status: 'draft' | 'published' | 'scheduled' | 'failed'
  published_at?: string
  external_id?: string
  created_at?: string
  updated_at?: string
}

export interface PostAnalytics {
  id?: string
  content_id: string
  source: 'substack' | 'web' | 'linkedin'
  views: number
  unique_visitors: number
  opens: number
  open_rate: number
  subscriptions: number
  likes: number
  comments: number
  shares: number
  clicks: number
  recorded_at?: string
  synced_at?: string
}

export class ContentService {
  /**
   * Create a new content item
   */
  static async create(content: Omit<ContentItem, 'id' | 'created_at' | 'updated_at'>) {
    const slug = content.slug || this.generateSlug(content.title)
    
    const { data, error } = await supabase
      .from('content')
      .insert({ ...content, slug })
      .select()
      .single()
    
    if (error) throw new Error(`Error creating content: ${error.message}`)
    return data
  }

  /**
   * Update an existing content item
   */
  static async update(id: string, updates: Partial<ContentItem>) {
    const { data, error } = await supabase
      .from('content')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw new Error(`Error updating content: ${error.message}`)
    return data
  }

  /**
   * Get content by ID
   */
  static async getById(id: string) {
    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw new Error(`Error fetching content: ${error.message}`)
    return data
  }

  /**
   * Get content by slug
   */
  static async getBySlug(slug: string) {
    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('slug', slug)
      .single()
    
    if (error) throw new Error(`Error fetching content: ${error.message}`)
    return data
  }

  /**
   * List content with filters
   */
  static async list(filters: {
    content_type?: string
    destination?: string
    status?: string
    source?: string
    user_id?: string
    limit?: number
    offset?: number
  } = {}) {
    let query = supabase
      .from('content')
      .select('*', { count: 'exact' })
    
    if (filters.content_type) query = query.eq('content_type', filters.content_type)
    if (filters.destination) query = query.eq('destination', filters.destination)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.source) query = query.eq('source', filters.source)
    if (filters.user_id) query = query.eq('user_id', filters.user_id)
    
    query = query
      .order('created_at', { ascending: false })
      .range(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50) - 1)
    
    const { data, error, count } = await query
    
    if (error) throw new Error(`Error listing content: ${error.message}`)
    return { items: data, total: count }
  }

  /**
   * Get recent topics for memory (avoid duplicates)
   */
  static async getRecentTopics(userId: string, limit = 15) {
    const { data, error } = await supabase
      .from('content')
      .select('title')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) throw new Error(`Error fetching topics: ${error.message}`)
    return data.map(d => d.title)
  }

  /**
   * Save analytics for a content item
   */
  static async saveAnalytics(analytics: Omit<PostAnalytics, 'id' | 'recorded_at' | 'synced_at'>) {
    const { data, error } = await supabase
      .from('post_analytics')
      .insert(analytics)
      .select()
      .single()
    
    if (error) throw new Error(`Error saving analytics: ${error.message}`)
    return data
  }

  /**
   * Get analytics for a content item
   */
  static async getAnalytics(contentId: string) {
    const { data, error } = await supabase
      .from('post_analytics')
      .select('*')
      .eq('content_id', contentId)
      .order('recorded_at', { ascending: false })
    
    if (error) throw new Error(`Error fetching analytics: ${error.message}`)
    return data
  }

  /**
   * Get aggregated analytics for all content
   */
  static async getAnalyticsSummary(userId?: string) {
    let query = supabase
      .from('post_analytics')
      .select('content_id, views, opens, open_rate, likes, comments, shares, clicks')
    
    if (userId) {
      query = query.eq('content.user_id', userId)
    }
    
    const { data, error } = await query
    
    if (error) throw new Error(`Error fetching analytics summary: ${error.message}`)
    
    // Aggregate by content
    const summary = data.reduce((acc, curr) => {
      if (!acc[curr.content_id]) {
        acc[curr.content_id] = {
          content_id: curr.content_id,
          total_views: 0,
          total_opens: 0,
          avg_open_rate: 0,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_clicks: 0,
          record_count: 0
        }
      }
      acc[curr.content_id].total_views += curr.views || 0
      acc[curr.content_id].total_opens += curr.opens || 0
      acc[curr.content_id].avg_open_rate += curr.open_rate || 0
      acc[curr.content_id].total_likes += curr.likes || 0
      acc[curr.content_id].total_comments += curr.comments || 0
      acc[curr.content_id].total_shares += curr.shares || 0
      acc[curr.content_id].total_clicks += curr.clicks || 0
      acc[curr.content_id].record_count += 1
      return acc
    }, {} as Record<string, any>)
    
    // Calculate averages
    Object.values(summary).forEach((s: any) => {
      if (s.record_count > 0) {
        s.avg_open_rate = s.avg_open_rate / s.record_count
      }
    })
    
    return Object.values(summary)
  }

  /**
   * Delete content
   */
  static async delete(id: string) {
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', id)
    
    if (error) throw new Error(`Error deleting content: ${error.message}`)
    return true
  }

  /**
   * Generate URL-friendly slug from title
   */
  static generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Date.now().toString(36)
  }
}

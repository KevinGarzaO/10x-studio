import { supabase } from './supabase'
import type { Topic, HistoryEntry, CalendarEvent, AppSettings, PromptTemplate, Campaign, ScheduledPost, IntegrationSettings, UserRow, CookieRow, PostRow, StatRow, SubscriberRow } from '@/types'

/**
 * Utility for singular objects stored as a single row in Supabase
 */
async function getSingular<T>(table: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select('data')
    .eq('id', 1)
    .single()
  
  if (error || !data) return fallback
  return data.data as T
}

async function saveSingular<T>(table: string, data: T): Promise<void> {
  await supabase
    .from(table)
    .upsert({ id: 1, data, updated_at: new Date().toISOString() })
}

/**
 * Utility for collections stored as multiple rows
 */
async function getCollection<T extends { id: string }>(table: string): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('data')
  
  if (error || !data) return []
  return data.map((item: any) => item.data as T)
}

async function saveCollection<T extends { id: string }>(table: string, data: T[]): Promise<void> {
  // Simple approach: Delete all and re-insert (sync behavior similar to writeFileSync)
  // For better performance, this should be partial updates, but this matches original logic
  await supabase.from(table).delete().neq('id', '0')
  
  if (data.length > 0) {
    const rows = data.map(item => ({
      id: item.id,
      data: item
    }))
    await supabase.from(table).insert(rows)
  }
}

export const db = {
  topics: { 
    getAll: () => getCollection<Topic>('topics'), 
    save: (d: Topic[]) => saveCollection<Topic>('topics', d) 
  },
  history: { 
    getAll: () => getCollection<HistoryEntry>('history'), 
    save: (d: HistoryEntry[]) => saveCollection<HistoryEntry>('history', d) 
  },
  calendar: { 
    getAll: () => getCollection<CalendarEvent>('calendar'), 
    save: (d: CalendarEvent[]) => saveCollection<CalendarEvent>('calendar', d) 
  },
  settings: { 
    get: () => getSingular<AppSettings>('settings', { apiKey: '', niche: '', audience: '' } as AppSettings), 
    save: (d: AppSettings) => saveSingular<AppSettings>('settings', d) 
  },
  templates: { 
    getAll: () => getCollection<PromptTemplate>('templates'), 
    save: (d: PromptTemplate[]) => saveCollection<PromptTemplate>('templates', d) 
  },
  campaigns: { 
    getAll: () => getCollection<Campaign>('campaigns'), 
    save: (d: Campaign[]) => saveCollection<Campaign>('campaigns', d) 
  },
  scheduled: { 
    getAll: () => getCollection<ScheduledPost>('scheduled'), 
    save: (d: ScheduledPost[]) => saveCollection<ScheduledPost>('scheduled', d) 
  },
  integrations: { 
    get: () => getSingular<IntegrationSettings>('integrations', {} as IntegrationSettings), 
    save: (d: IntegrationSettings) => saveSingular<IntegrationSettings>('integrations', d) 
  },
  // ── New Relational Tables ──────────────────────────────
  substack: {
    user: {
      get: async (substack_user_id?: string) => {
        const query = supabase.from('users').select('*')
        if (substack_user_id) query.eq('substack_user_id', substack_user_id)
        else query.order('created_at', { ascending: false }).limit(1)
        const { data } = await query.maybeSingle()
        return data as UserRow | null
      },
      upsert: async (user: Partial<UserRow>) => {
        // If we have the UUID id, use it as primary conflict key, else use substack_user_id
        const conflictColumn = user.id ? 'id' : 'substack_user_id'
        const { data, error } = await supabase.from('users').upsert(user, { onConflict: conflictColumn }).select().maybeSingle()
        if (error) throw error
        return data as UserRow
      }
    },
    cookies: {
      get: async (user_id: string) => {
        const { data } = await supabase.from('cookies').select('*').eq('user_id', user_id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
        return data as CookieRow | null
      },
      upsert: async (cookie: Partial<CookieRow>) => {
        await supabase.from('cookies').upsert(cookie)
      }
    },
    posts: {
      getAll: async (user_id: string) => {
        const { data } = await supabase.from('posts').select('*').eq('user_id', user_id).order('published_at', { ascending: false })
        return (data || []) as PostRow[]
      },
      upsertMany: async (posts: Partial<PostRow>[]) => {
        await supabase.from('posts').upsert(posts, { onConflict: 'user_id,post_id' })
      }
    },
    stats: {
      getLatest: async (user_id: string) => {
        const { data } = await supabase.from('stats').select('*').eq('user_id', user_id).order('date', { ascending: false }).limit(1).maybeSingle()
        return data as StatRow | null
      },
      upsert: async (stat: Partial<StatRow>) => {
        await supabase.from('stats').upsert(stat, { onConflict: 'user_id,date' })
      }
    },
    subscribers: {
      getAll: async (user_id: string) => {
        const { data } = await supabase.from('subscribers').select('*').eq('user_id', user_id).order('synced_at', { ascending: false })
        return (data || []) as SubscriberRow[]
      },
      upsertMany: async (subscribers: Partial<SubscriberRow>[]) => {
        // Break into chunks if too large to avoid Supabase limits. Usually 1000 is safe.
        const chunkSize = 500;
        console.log(`[Storage] Upserting ${subscribers.length} subscribers in chunks...`);
        for (let i = 0; i < subscribers.length; i += chunkSize) {
          const chunk = subscribers.slice(i, i + chunkSize);
          const { error } = await supabase.from('subscribers').upsert(chunk);
          if (error) {
            console.error(`[Storage] Upsert chunk error at index ${i}:`, error);
            throw error;
          }
        }
      },
      deleteAll: async (user_id: string) => {
        await supabase.from('subscribers').delete().eq('user_id', user_id);
      }
    }
  }
}

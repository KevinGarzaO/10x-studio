import { api } from './api'
import type { Topic, HistoryEntry, CalendarEvent, AppSettings, PromptTemplate, Campaign, ScheduledPost, IntegrationSettings, UserRow, CookieRow, PostRow, StatRow, SubscriberRow } from '@/types'

/**
 * Utility for singular objects stored as a single row (via Backend API)
 */
async function getSingular<T>(path: string): Promise<T> {
  return api<T>(`/api/${path}`)
}

async function saveSingular<T>(path: string, data: T): Promise<void> {
  await api(`/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * Utility for collections stored as multiple rows (via Backend API)
 */
async function getCollection<T>(path: string): Promise<T[]> {
  return api<T[]>(`/api/${path}`)
}

async function saveCollection<T>(path: string, data: T[]): Promise<void> {
  await api(`/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
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
    get: () => getSingular<AppSettings>('settings'), 
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
    get: () => getSingular<IntegrationSettings>('integrations'), 
    save: (d: IntegrationSettings) => saveSingular<IntegrationSettings>('integrations', d) 
  },
  
  // ── Substack endpoints (now proxying via Backend) ────────────────────────
  substack: {
    user: {
      get: async () => api<UserRow | null>('/api/substack/profile'),
      upsert: async (user: Partial<UserRow>) => api<UserRow>('/api/substack/profile', {
        method: 'POST',
        body: JSON.stringify(user)
      })
    },
    cookies: {
      get: async (user_id: string) => api<CookieRow | null>(`/api/substack/cookies/${user_id}`),
      upsert: async (cookie: Partial<CookieRow>) => api('/api/substack/cookies', {
        method: 'POST',
        body: JSON.stringify(cookie)
      })
    },
    posts: {
      getAll: async (user_id: string) => api<PostRow[]>('/api/substack/posts'),
      upsertMany: async (posts: Partial<PostRow>[]) => {} // Handle server-side during sync
    },
    stats: {
      getLatest: async (user_id: string) => api<StatRow | null>('/api/substack/stats'),
      upsert: async (stat: Partial<StatRow>) => {} // Handle server-side during sync
    },
    subscribers: {
      getAll: async (user_id: string) => {
        const res = await api<{ subscribers: SubscriberRow[] }>('/api/substack/subscribers')
        return res.subscribers
      },
      upsertMany: async (subscribers: Partial<SubscriberRow>[]) => {}, // Handle server-side
      deleteAll: async (user_id: string) => {} // Handle server-side
    }
  }
}

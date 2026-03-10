import { supabase } from './supabase'
import type { Topic, HistoryEntry, CalendarEvent, AppSettings, PromptTemplate, Campaign, ScheduledPost, IntegrationSettings } from '@/types'

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
  return data.map(item => item.data as T)
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
}

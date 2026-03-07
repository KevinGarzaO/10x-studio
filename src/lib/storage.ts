import fs from 'fs'
import path from 'path'
import type { Topic, HistoryEntry, CalendarEvent, AppSettings, PromptTemplate, Campaign, ScheduledPost, IntegrationSettings } from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readJSON<T>(filename: string, fallback: T): T {
  ensureDir()
  const file = path.join(DATA_DIR, filename)
  if (!fs.existsSync(file)) return fallback
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T } catch { return fallback }
}

function writeJSON<T>(filename: string, data: T): void {
  ensureDir()
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2))
}

export const db = {
  topics:       { getAll: () => readJSON<Topic[]>('topics.json', []),              save: (d: Topic[])              => writeJSON('topics.json', d) },
  history:      { getAll: () => readJSON<HistoryEntry[]>('history.json', []),      save: (d: HistoryEntry[])       => writeJSON('history.json', d) },
  calendar:     { getAll: () => readJSON<CalendarEvent[]>('calendar.json', []),    save: (d: CalendarEvent[])      => writeJSON('calendar.json', d) },
  settings:     { get:    () => readJSON<AppSettings>('settings.json', { apiKey: '', niche: '', audience: '' }), save: (d: AppSettings) => writeJSON('settings.json', d) },
  templates:    { getAll: () => readJSON<PromptTemplate[]>('templates.json', []),  save: (d: PromptTemplate[])     => writeJSON('templates.json', d) },
  campaigns:    { getAll: () => readJSON<Campaign[]>('campaigns.json', []),        save: (d: Campaign[])           => writeJSON('campaigns.json', d) },
  scheduled:    { getAll: () => readJSON<ScheduledPost[]>('scheduled.json', []),   save: (d: ScheduledPost[])      => writeJSON('scheduled.json', d) },
  integrations: { get:    () => readJSON<IntegrationSettings>('integrations.json', {}), save: (d: IntegrationSettings) => writeJSON('integrations.json', d) },
}

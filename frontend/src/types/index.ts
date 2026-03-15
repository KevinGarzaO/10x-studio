export type TopicStatus = 'idea' | 'ready' | 'writing' | 'done'
export type TopicPriority = 1 | 2 | 3  // 1=Alta, 2=Media, 3=Baja

export type Platform =
  | 'blog'
  | 'linkedin-post'
  | 'linkedin-article'
  | 'substack-article'
  | 'substack-note'

export interface Topic {
  id: string
  title: string
  status: TopicStatus
  tags: string[]
  notes: string
  created: string       // YYYY-MM-DD
  campaignId?: string   // NEW: group by campaign
  priority?: TopicPriority  // NEW: 1=Alta 2=Media 3=Baja
  seoVolume?: string    // NEW: estimated search volume
  seoKeyword?: string   // NEW: target keyword
  researchSummary?: string  // NEW: AI research summary
}

export interface Campaign {
  id: string
  name: string
  color: string   // hex
  description?: string
  created: string
}

export interface HistoryEntry {
  id: string
  topic: string
  topicId: string | null
  platforms: Platform[]
  date: string      // YYYY-MM-DD
  wordCount: number
}

export interface CalendarEvent {
  id: string
  topicId: string | null
  topicTitle?: string
  date: string      // YYYY-MM-DD
  platform: Platform
  status: 'pending' | 'published'
}

export interface AppSettings {
  apiKey: string // Default or legacy key (usually Claude)
  textModel?: 'claude' | 'chatgpt' | 'gemini' | 'mistral' | 'llama' | 'grok' | 'cohere' | 'deepseek'
  imgModel?: 'dalle' | 'midjourney' | 'stable-diffusion' | 'nanobanana' | 'imagen' | 'flux' | 'ideogram' | 'firefly'
  apiKeys?: {
    claude?: string
    chatgpt?: string
    gemini?: string
    mistral?: string
    llama?: string
    grok?: string
    cohere?: string
    deepseek?: string
    dalle?: string
    midjourney?: string
    'stable-diffusion'?: string
    nanobanana?: string
    imagen?: string
    flux?: string
    ideogram?: string
    firefly?: string
  }
  modelVersions?: {
    claude?: string
    chatgpt?: string
    gemini?: string
    mistral?: string
    llama?: string
    grok?: string
    cohere?: string
    deepseek?: string
    dalle?: string
    midjourney?: string
    'stable-diffusion'?: string
    nanobanana?: string
    imagen?: string
    flux?: string
    ideogram?: string
    firefly?: string
  }
  niche: string
  audience: string
  substackCookie?: string
  substackPublication?: string
}

export interface GeneratedResult {
  platform: Platform
  text: string
  status: 'pending' | 'loading' | 'done' | 'error'
  error?: string
  wordCount?: number
}

export interface ScheduledPost {
  id: string
  type: 'note' | 'article'
  title: string
  content: string
  scheduleAt: string   // ISO string
  status: 'pending' | 'published' | 'error'
  errorMsg?: string
  publishedAt?: string
  calendarEventId?: string
}

export interface PromptTemplate {
  id: string
  name: string
  platform: Platform
  description: string
  systemPrompt: string   // replaces the default prompt
  created: string
}

// ── Constants ────────────────────────────────────────────
export const PLATFORMS: Record<Platform, { label: string; icon: string; sub: string; short: boolean }> = {
  blog:               { label: 'Blog',           icon: '📝', sub: 'Artículo web', short: false },
  'linkedin-post':    { label: 'LinkedIn Post',  icon: '💼', sub: 'Post',         short: true  },
  'linkedin-article': { label: 'LinkedIn Art.',  icon: '📋', sub: 'Artículo',     short: false },
  'substack-article': { label: 'Substack Art.',  icon: '📰', sub: 'Artículo',     short: false },
  'substack-note':    { label: 'Substack Nota',  icon: '🗒️', sub: 'Nota',         short: true  },
}

export const STATUS_LABELS: Record<TopicStatus, string> = {
  idea:    '💡 Idea',
  ready:   '✅ Listo',
  writing: '✏️ Escribiendo',
  done:    '✓ Hecho',
}

export const PRIORITY_LABELS: Record<TopicPriority, { label: string; color: string }> = {
  1: { label: '🔴 Alta',  color: 'text-red-600 bg-red-50 border-red-200' },
  2: { label: '🟡 Media', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  3: { label: '🟢 Baja',  color: 'text-green-600 bg-green-50 border-green-200' },
}

export const CAMPAIGN_COLORS = [
  '#c9963a','#2d6fa4','#3d9e6b','#9b59b6','#e67e22','#e74c3c','#1abc9c','#34495e',
]

export const ALL_PLATFORMS: Platform[] = [
  'blog', 'linkedin-post', 'linkedin-article', 'substack-article', 'substack-note',
]

// ── Integrations ─────────────────────────────────────────
export interface IntegrationSettings {
  // WordPress
  wpUrl?: string          // https://miblog.com
  wpUsername?: string
  wpAppPassword?: string  // Application Password (not real password)
  wpDefaultStatus?: 'draft' | 'publish'
  // LinkedIn
  linkedinToken?: string  // access_token pasted by user
  linkedinPersonId?: string  // urn:li:person:xxx — fetched automatically
  // Webhooks
  webhooks?: WebhookConfig[]
}

export interface WebhookConfig {
  id: string
  name: string
  url: string
  secret?: string         // added as X-Webhook-Secret header
  platforms: Platform[]   // which platforms trigger this webhook
  active: boolean
}

export interface PublishResult {
  ok: boolean
  url?: string
  id?: string
  error?: string
}

// ── New Relational Schema Types ──────────────────────────

export interface UserRow {
  id: string
  substack_user_id: string
  substack_slug: string
  name: string
  handle: string
  photo_url: string
  bio: string
  publication_id: string
  subdomain: string
  subscriber_count: number
  created_at: string
  updated_at: string
}

export interface CookieRow {
  id: string
  user_id: string
  substack_sid: string
  substack_lli: string
  visit_id: string
  expires_at: string
  created_at: string
  updated_at: string
}

export interface PostRow {
  id: string
  user_id: string
  post_id: string
  title: string
  subtitle: string
  cover_image_url: string
  published_at: string
  audience: string
  is_published: boolean
  synced_at: string
}

export interface StatRow {
  id: string
  user_id: string
  subscriber_count: number
  follower_count: number
  date: string
  created_at: string
}

export interface SubscriberRow {
  id: string
  user_id: string
  email: string
  name: string
  type: string
  created_at: string
  country: string
  active: boolean
  stars: number | null
  opens7d: number | null
  opens30d: number | null
  opens6m: number | null
  revenue: number | null
  source: string
  synced_at: string
}

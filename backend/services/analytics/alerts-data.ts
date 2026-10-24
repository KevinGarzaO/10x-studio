import { supabase } from '../supabase.service'
import { siteUrl } from '../linkedin/vacancy-publisher'
import { buildAlerts, type Alert } from './alerts'
import { dayKey, uniqueVisitors } from './metrics'
import { readAll } from './read'
import { expectedPublicationsToday } from './schedule'

const DAY_MS = 86400000

/**
 * Junta los números de hoy y de ayer y los pasa por las reglas de alarma (services/analytics/alerts.ts).
 * Lo usan la ruta del panel y la revisión que corre cada hora.
 */
export async function loadAlerts(now: Date = new Date()): Promise<Alert[]> {
  const since = new Date(now.getTime() - 2 * DAY_MS)
  const today = dayKey(now.toISOString())

  const [visits, users, posts, { data: profile }] = await Promise.all([
    // Solo visitas con un origen identificado: el tráfico directo mezcla pruebas propias y robots.
    readAll<{ visitor_id: string; created_at: string }>((from, to) =>
      supabase.from('landing_visits').select('visitor_id, created_at').not('source', 'is', null).gte('created_at', since.toISOString()).range(from, to),
    ),
    readAll<{ created_at: string }>((from, to) =>
      supabase
        .from('users')
        .select('created_at')
        .eq('is_test_account', false)
        .not('is_scraper_profile', 'is', true)
        .in('user_kind', ['user', 'company'])
        .gte('created_at', since.toISOString())
        .range(from, to),
    ),
    readAll<{ status: string; published_at: string | null; created_at: string }>((from, to) =>
      supabase.from('linkedin_vacancy_posts').select('status, published_at, created_at').gte('created_at', new Date(now.getTime() - DAY_MS).toISOString()).range(from, to),
    ),
    supabase.from('linkedin_profiles').select('expires_at').not('access_token', 'is', null).order('connected_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const expiresAt = profile?.expires_at ?? null

  return buildAlerts({
    recent: { attributedVisitors: uniqueVisitors(visits), signups: users.length },
    linkedin: {
      connected: !!profile,
      daysLeft: expiresAt ? Math.floor((Date.parse(expiresAt) - now.getTime()) / DAY_MS) : null,
      publishing: process.env.LINKEDIN_VACANCY_POSTS === 'on',
      siteUrlConfigured: siteUrl() !== null,
      failedLast24h: posts.filter((post) => post.status === 'failed').length,
      publishedToday: posts.filter((post) => post.status === 'published' && post.published_at && dayKey(post.published_at) === today).length,
      expectedToday: expectedPublicationsToday(now),
    },
  })
}

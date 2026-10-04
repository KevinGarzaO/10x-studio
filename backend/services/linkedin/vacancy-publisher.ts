import { supabase } from '../supabase.service'
import { LinkedInService } from '../linkedin.service'
import {
  buildPostText,
  cardFor,
  pickVacancy,
  vacancyUrl,
  type LinkedInVacancy,
  type PostedVacancy,
} from './vacancy-post'

/**
 * Publica en el LinkedIn de la persona dueña de la cuenta una vacante del feed, sin IA:
 * el texto sale de una plantilla (vacancy-post.ts). Corre dos veces al día, de lunes a
 * sábado, desde cron.service.ts.
 */

/** Cuántos días hacia atrás se buscan vacantes: una vieja puede estar ya cerrada. */
const MAX_AGE_DAYS = 45
/** Un intento fallido bloquea la vacante este tiempo, para no reintentar a ciegas. */
const FAILED_RETRY_HOURS = 24

export interface PublishResult {
  status: 'published' | 'preview' | 'skipped'
  reason?: string
  text?: string
  url?: string
  vacancy?: LinkedInVacancy
  linkedinPostId?: string
}

interface Row {
  id: string
  slug: string | null
  title: string
  company: string | null
  location: string | null
  modalidad: string | null
  seniority_level: string | null
  role_category: string | null
  skills: unknown
  budget: string | null
  company_logo: string | null
  created_at: string | null
}

const toVacancy = (row: Row): LinkedInVacancy => ({
  ...row,
  skills: Array.isArray(row.skills) ? row.skills.filter((skill): skill is string => typeof skill === 'string') : [],
})

/** La dirección pública del sitio, de donde salen los enlaces. Nunca localhost. */
export function siteUrl(): string | null {
  const url = process.env.COMMUNITY_APP_URL || ''
  return url && !/localhost|127\.0\.0\.1/.test(url) ? url : null
}

/**
 * Las vacantes que se pueden publicar y lo ya publicado. Se pide aparte para que la vista
 * previa pueda simular varios turnos seguidos sin tocar la base.
 */
export async function loadPool(): Promise<{ candidates: LinkedInVacancy[]; history: PostedVacancy[]; posted: number; skillLabels: Record<string, string> }> {
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString()

  const [{ data: rows }, { data: log }, { data: catalog }] = await Promise.all([
    supabase
      .from('community_posts')
      .select('id, slug, title, company, location, modalidad, seniority_level, role_category, skills, budget, company_logo, created_at')
      .eq('type', 'job')
      .not('slug', 'is', null)
      .not('role_category', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(600),
    supabase
      .from('linkedin_vacancy_posts')
      .select('vacancy_id, company, role_category, status, created_at, published_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('skills').select('name, label'),
  ])

  const used = new Set<string>()
  const history: PostedVacancy[] = []
  const failedFrom = Date.now() - FAILED_RETRY_HOURS * 3600000
  for (const entry of (log || []) as { vacancy_id: string | null; company: string | null; role_category: string | null; status: string; created_at: string; published_at: string | null }[]) {
    if (entry.vacancy_id && (entry.status !== 'failed' || Date.parse(entry.created_at) >= failedFrom)) used.add(entry.vacancy_id)
    if (entry.status === 'published') {
      history.push({ company: entry.company, role_category: entry.role_category, published_at: entry.published_at ?? entry.created_at })
    }
  }

  const candidates = ((rows || []) as Row[]).filter((row) => !used.has(row.id)).map(toVacancy)
  const skillLabels = Object.fromEntries(((catalog || []) as { name: string; label: string }[]).map((skill) => [skill.name, skill.label]))
  return { candidates, history, posted: history.length, skillLabels }
}

/**
 * @param dryRun  arma el texto y lo devuelve sin publicar ni guardar nada.
 */
export async function publishVacancyPost(options: { dryRun?: boolean } = {}): Promise<PublishResult> {
  const base = siteUrl()
  if (!base) return { status: 'skipped', reason: 'COMMUNITY_APP_URL no está configurada con la dirección pública del sitio' }

  const { candidates, history, posted, skillLabels } = await loadPool()
  const vacancy = pickVacancy(candidates, history)
  if (!vacancy || !vacancy.slug) return { status: 'skipped', reason: 'no hay vacantes disponibles para publicar' }

  const url = vacancyUrl(base, vacancy.slug)
  const text = buildPostText(vacancy, url, posted, skillLabels)
  if (options.dryRun) return { status: 'preview', text, url, vacancy }

  const { data: profile } = await supabase
    .from('linkedin_profiles')
    .select('access_token, linkedin_id, expires_at')
    .not('access_token', 'is', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!profile?.access_token || !profile.linkedin_id) return { status: 'skipped', reason: 'LinkedIn no está conectado', vacancy }
  if (profile.expires_at && Date.parse(profile.expires_at) < Date.now()) {
    return { status: 'skipped', reason: 'el token de LinkedIn venció: vuelve a conectar la cuenta', vacancy }
  }

  // Un intento anterior fallido (ya pasó la espera) o que se quedó a medias libera la
  // vacante para poder reservarla de nuevo.
  await supabase.from('linkedin_vacancy_posts').delete().eq('vacancy_id', vacancy.id).eq('status', 'failed')
  await supabase
    .from('linkedin_vacancy_posts')
    .delete()
    .eq('vacancy_id', vacancy.id)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 3600000).toISOString())

  // La fila se crea ANTES de publicar: si dos ejecuciones coinciden, el UNIQUE de
  // vacancy_id hace que solo una gane y la otra no publique nada.
  const { data: claim, error: claimError } = await supabase
    .from('linkedin_vacancy_posts')
    .insert({
      vacancy_id: vacancy.id,
      vacancy_slug: vacancy.slug,
      company: vacancy.company,
      role_category: vacancy.role_category,
      post_text: text,
      post_url: url,
      status: 'pending',
    })
    .select('id')
    .single()

  if (claimError || !claim) {
    // Un fallo anterior de esa vacante deja su fila: se reintenta en lugar de quedar atorada.
    return { status: 'skipped', reason: `no se pudo reservar la vacante (${claimError?.message ?? 'sin respuesta'})`, vacancy }
  }

  try {
    const card = cardFor(vacancy)
    const linkedinPostId: string = await LinkedInService.publish({
      token: profile.access_token,
      urn: `urn:li:person:${profile.linkedin_id}`,
      text,
      article: { url, title: card.title, description: card.description },
    })

    await supabase
      .from('linkedin_vacancy_posts')
      .update({ status: 'published', linkedin_post_id: linkedinPostId, published_at: new Date().toISOString() })
      .eq('id', claim.id)

    return { status: 'published', text, url, vacancy, linkedinPostId }
  } catch (error) {
    const message = (error as Error).message
    await supabase.from('linkedin_vacancy_posts').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', claim.id)
    throw error
  }
}

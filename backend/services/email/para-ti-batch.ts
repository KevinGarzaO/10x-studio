import { Resend } from 'resend'
import { supabase } from '../supabase.service'
import { notify } from '../notifications/notify'
import { RESERVE, isQuotaError, remainingBudget, sendTracked } from './budget'
import { trackedLink } from './links'
import { ALERT_MIN_SCORE, DIGEST_MIN_SCORE, DIGEST_SIZE, DIGEST_WINDOW_DAYS, metaOf, rankMatches, type MatchableVacancy, type RankedMatch } from './para-ti'
import { firstName, mailConfigFromEnv, type MailConfig } from './profile-reminder'
import { renderAlert, renderDigest, type MatchItem } from './templates/para-ti'
import type { RenderedEmail } from './templates/profile-reminder'

/** Topes por persona para no saturarla. */
export const ALERT_MAX_PER_DAY = 1
export const ALERT_MAX_PER_WEEK = 3
/** El resumen semanal: uno cada 6 días como mucho (así el martes y el miércoles no se duplican). */
export const DIGEST_MIN_GAP_DAYS = 6
/** Las alertas miran las vacantes publicadas en este tiempo; lo ya avisado no se repite. */
export const ALERT_WINDOW_DAYS = 2
/** Cuántos correos sale como máximo cada tipo en una corrida. */
export const ALERT_EMAILS_PER_RUN = 15
export const DIGEST_EMAILS_PER_RUN = 40

export interface MatchPerson {
  id: string
  email: string | null
  display_name: string | null
  name: string | null
  username: string | null
  role_category: string | null
  seniority: string | null
  skills: string[] | null
  work_modality: string | null
  email_opt_out: boolean | null
  email_prefs: { digest?: boolean; alerts?: boolean } | null
}

export interface MatchHistory {
  /** Vacantes que ya se le avisaron a cada persona. */
  alerted: Map<string, Set<string>>
  /** Correos de "Para ti" ya enviados. */
  emails: { user_id: string; kind: 'digest' | 'alert'; created_at: string }[]
}

const candidateOf = (person: MatchPerson) => ({ roleCategory: person.role_category, seniority: person.seniority, skills: person.skills ?? [], workModality: person.work_modality })
const canEmail = (person: MatchPerson): boolean => !!person.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) && !person.email_opt_out

function emailsOf(history: MatchHistory, userId: string, kind: 'digest' | 'alert', since: number): number {
  return history.emails.filter(item => item.user_id === userId && item.kind === kind && Date.parse(item.created_at) >= since).length
}

export interface AlertPlan {
  person: MatchPerson
  match: RankedMatch
  /** Además del aviso en la campana, ¿se le manda correo? (si lo quiere y no ha llegado a los topes) */
  email: boolean
}

/**
 * Para cada persona, la mejor vacante nueva con compatibilidad de 80 % o más que aún no se le haya avisado. El aviso en
 * la campana va siempre; el correo solo si lo tiene encendido y no pasó de 1 al día ni 3 a la semana. Pura.
 */
export function planAlerts(people: MatchPerson[], vacancies: MatchableVacancy[], history: MatchHistory, now: Date = new Date()): AlertPlan[] {
  const plans: AlertPlan[] = []
  for (const person of people) {
    if (!person.role_category) continue
    const done = history.alerted.get(person.id) ?? new Set<string>()
    const fresh = vacancies.filter(vacancy => !done.has(vacancy.id))
    const [match] = rankMatches(candidateOf(person), fresh, { minScore: ALERT_MIN_SCORE, limit: 1, windowDays: ALERT_WINDOW_DAYS, now })
    if (!match) continue

    const today = emailsOf(history, person.id, 'alert', now.getTime() - 24 * 3600000)
    const week = emailsOf(history, person.id, 'alert', now.getTime() - 7 * 24 * 3600000)
    const wants = person.email_prefs?.alerts !== false
    plans.push({ person, match, email: wants && canEmail(person) && today < ALERT_MAX_PER_DAY && week < ALERT_MAX_PER_WEEK })
  }
  return plans
}

export interface DigestPlan {
  person: MatchPerson
  matches: RankedMatch[]
}

/** Quién recibe el resumen semanal: lo tiene encendido, no recibió uno en los últimos 6 días y hay al menos una vacante de 60 % o más. Pura. */
export function planDigests(people: MatchPerson[], vacancies: MatchableVacancy[], history: MatchHistory, now: Date = new Date()): DigestPlan[] {
  const plans: DigestPlan[] = []
  for (const person of people) {
    if (!person.role_category || !canEmail(person) || person.email_prefs?.digest === false) continue
    if (emailsOf(history, person.id, 'digest', now.getTime() - DIGEST_MIN_GAP_DAYS * 24 * 3600000) > 0) continue
    const matches = rankMatches(candidateOf(person), vacancies, { minScore: DIGEST_MIN_SCORE, limit: DIGEST_SIZE, windowDays: DIGEST_WINDOW_DAYS, now })
    if (matches.length > 0) plans.push({ person, matches })
  }
  return plans
}

// ---------- datos ----------

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

export async function loadMatchPeople(): Promise<MatchPerson[]> {
  const base = 'id, email, display_name, name, username, role_category, seniority, skills, work_modality, email_opt_out, user_kind, is_test_account, is_scraper_profile, profile_completed'
  type Row = MatchPerson & { user_kind: string; is_test_account: boolean | null; is_scraper_profile: boolean | null; profile_completed: boolean | null }
  let rows: Row[]
  try {
    rows = await readAll<Row>((from, to) => supabase.from('users').select(`${base}, email_prefs`).range(from, to) as never)
  } catch {
    // Sin la columna email_prefs (migración pendiente): todo se trata como encendido.
    rows = (await readAll<Row>((from, to) => supabase.from('users').select(base).range(from, to) as never)).map(row => ({ ...row, email_prefs: null }))
  }
  return rows.filter(row => row.user_kind === 'user' && !row.is_test_account && !row.is_scraper_profile && row.profile_completed && row.role_category)
}

export async function loadVacancies(days: number): Promise<MatchableVacancy[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await supabase
    .from('community_posts')
    .select('id, slug, title, company, modalidad, seniority_level, role_category, skills, created_at')
    .eq('type', 'job')
    .not('slug', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(600)
  return ((data ?? []) as (Omit<MatchableVacancy, 'skills'> & { skills: unknown })[]).map(row => ({ ...row, skills: Array.isArray(row.skills) ? (row.skills as string[]) : [] }))
}

/** null si todavía no existen las tablas (migración pendiente): sin historial se repetirían los avisos, así que no se corre. */
export async function loadHistory(now: Date = new Date()): Promise<MatchHistory | null> {
  try {
    const alerts = await readAll<{ user_id: string; vacancy_id: string }>((from, to) => supabase.from('match_alerts').select('user_id, vacancy_id').gte('created_at', new Date(now.getTime() - 14 * 86400000).toISOString()).range(from, to) as never)
    const emails = await readAll<MatchHistory['emails'][number]>((from, to) => supabase.from('match_emails').select('user_id, kind, created_at').gte('created_at', new Date(now.getTime() - 8 * 86400000).toISOString()).range(from, to) as never)
    const alerted = new Map<string, Set<string>>()
    for (const row of alerts) alerted.set(row.user_id, (alerted.get(row.user_id) ?? new Set()).add(row.vacancy_id))
    return { alerted, emails }
  } catch {
    return null
  }
}

async function loadLabels(): Promise<(skills: string[]) => string[]> {
  const { data } = await supabase.from('skills').select('name, label')
  const labelOf = new Map((data ?? []).map(row => [String(row.name).toLowerCase(), String(row.label)]))
  return skills => skills.map(skill => labelOf.get(skill) ?? skill)
}

// ---------- corridas ----------

export interface MatchDeps {
  mailConfig: () => { config: MailConfig | null; missing: string[] }
  loadPeople: () => Promise<MatchPerson[]>
  loadVacancies: (days: number) => Promise<MatchableVacancy[]>
  loadHistory: () => Promise<MatchHistory | null>
  remainingBudget: (reserve: number) => Promise<number>
  labels: () => Promise<(skills: string[]) => string[]>
  /** Anota el aviso (para no repetirlo) y lo deja en la campana. */
  recordAlert: (person: MatchPerson, match: RankedMatch) => Promise<boolean>
  markAlertEmailed: (person: MatchPerson, match: RankedMatch) => Promise<void>
  recordEmail: (person: MatchPerson, kind: 'digest' | 'alert', resendId: string | null) => Promise<void>
  sendEmail: (person: MatchPerson, email: RenderedEmail, config: MailConfig) => Promise<{ ok: boolean; id?: string | null; quota?: boolean }>
  now: () => Date
}

export const defaultMatchDeps: MatchDeps = {
  mailConfig: mailConfigFromEnv,
  loadPeople: loadMatchPeople,
  loadVacancies,
  loadHistory: () => loadHistory(),
  remainingBudget: reserve => remainingBudget(new Date(), reserve),
  labels: loadLabels,
  recordAlert: async (person, match) => {
    const claim = await supabase.from('match_alerts').insert({ user_id: person.id, vacancy_id: match.vacancy.id, score: match.score })
    if (claim.error) return false
    await notify({
      userId: person.id,
      type: 'match',
      message: `Nueva vacante con ${match.score} % de compatibilidad: ${match.vacancy.title.trim()}${match.vacancy.company ? ` en ${match.vacancy.company.trim()}` : ''}`,
      link: `/vacantes/${match.vacancy.slug}`,
      meta: { score: match.score, vacancyId: match.vacancy.id },
    })
    return true
  },
  markAlertEmailed: async (person, match) => { await supabase.from('match_alerts').update({ emailed: true }).eq('user_id', person.id).eq('vacancy_id', match.vacancy.id) },
  recordEmail: async (person, kind, resendId) => { await supabase.from('match_emails').insert({ user_id: person.id, kind, resend_id: resendId }) },
  sendEmail: async (person, email, config) => {
    const { data, error } = await sendTracked(new Resend(config.apiKey), { from: config.from, replyTo: config.replyTo, to: person.email!, subject: email.subject, html: email.html, text: email.text }, 'para-ti')
    if (error) return { ok: false, quota: isQuotaError(error) }
    await new Promise(resolve => setTimeout(resolve, 600))
    return { ok: true, id: data?.id ?? null }
  },
  now: () => new Date(),
}

const toItem = (match: RankedMatch, campaign: string, content: string, pretty: (skills: string[]) => string[]): MatchItem => ({
  title: match.vacancy.title.trim(),
  meta: metaOf(match.vacancy),
  url: trackedLink(`/vacantes/${match.vacancy.slug}`, campaign, content, 'para-ti'),
  score: match.score,
  shared: pretty(match.shared),
  missing: pretty(match.missing),
})

const displayName = (person: MatchPerson): string | null => {
  const name = firstName(person as never)
  return name === 'hola' ? null : name
}

export type MatchOutcome = { status: 'skipped'; reason: string } | { status: 'done'; planned: number; emailed: number; notified?: number; waiting: number }

/**
 * La corrida diaria de alertas: a cada persona con una vacante nueva de 80 % o más le deja un aviso en la campana y, si
 * lo quiere y no llegó a los topes, un correo. Los avisos en la campana no gastan cupo de correos; el correo sí.
 */
export async function runAlertBatch(deps: MatchDeps = defaultMatchDeps): Promise<MatchOutcome> {
  const history = await deps.loadHistory()
  if (!history) return { status: 'skipped', reason: 'falta aplicar notifications-migration.sql' }

  const now = deps.now()
  const plans = planAlerts(await deps.loadPeople(), await deps.loadVacancies(ALERT_WINDOW_DAYS), history, now)
  if (plans.length === 0) return { status: 'done', planned: 0, emailed: 0, notified: 0, waiting: 0 }

  const { config } = deps.mailConfig()
  const pretty = await deps.labels()
  let room = Math.min(ALERT_EMAILS_PER_RUN, await deps.remainingBudget(RESERVE.alerts))
  let emailed = 0
  let notified = 0
  let waiting = 0

  for (const plan of plans) {
    const fresh = await deps.recordAlert(plan.person, plan.match)
    if (!fresh) continue
    notified += 1
    if (!plan.email || !config) continue
    if (room <= 0) { waiting += 1; continue }

    const email = renderAlert({ name: displayName(plan.person), item: toItem(plan.match, 'para-ti-alerta', 'vacante', pretty), seeAllUrl: trackedLink('/', 'para-ti-alerta', 'ver-todas', 'para-ti') })
    const sent = await deps.sendEmail(plan.person, email, config)
    if (sent.quota) { room = 0; waiting += 1; continue }
    if (sent.ok) {
      emailed += 1
      room -= 1
      await deps.markAlertEmailed(plan.person, plan.match)
      await deps.recordEmail(plan.person, 'alert', sent.id ?? null)
    }
  }
  return { status: 'done', planned: plans.length, emailed, notified, waiting }
}

/** La corrida del resumen semanal: a cada persona con vacantes nuevas que encajan (60 % o más) y sin resumen en los últimos 6 días. */
export async function runDigestBatch(deps: MatchDeps = defaultMatchDeps): Promise<MatchOutcome> {
  const { config, missing } = deps.mailConfig()
  if (!config) return { status: 'skipped', reason: `falta ${missing.join(', ')}` }
  const history = await deps.loadHistory()
  if (!history) return { status: 'skipped', reason: 'falta aplicar notifications-migration.sql' }

  const now = deps.now()
  const plans = planDigests(await deps.loadPeople(), await deps.loadVacancies(DIGEST_WINDOW_DAYS), history, now)
  if (plans.length === 0) return { status: 'done', planned: 0, emailed: 0, waiting: 0 }

  const room = Math.min(DIGEST_EMAILS_PER_RUN, await deps.remainingBudget(RESERVE.digest))
  if (room <= 0) return { status: 'skipped', reason: 'no hay cupo de correos en estas 24 horas' }

  const pretty = await deps.labels()
  let emailed = 0
  for (const plan of plans.slice(0, room)) {
    const items = plan.matches.map((match, index) => toItem(match, 'para-ti-semanal', `v${index + 1}`, pretty))
    const email = renderDigest({ name: displayName(plan.person), items, seeAllUrl: trackedLink('/', 'para-ti-semanal', 'ver-todas', 'para-ti') })
    const sent = await deps.sendEmail(plan.person, email, config)
    if (sent.quota) break
    if (sent.ok) {
      emailed += 1
      await deps.recordEmail(plan.person, 'digest', sent.id ?? null)
    }
  }
  return { status: 'done', planned: plans.length, emailed, waiting: Math.max(0, plans.length - emailed) }
}

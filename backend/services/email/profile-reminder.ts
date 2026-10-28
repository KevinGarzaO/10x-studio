import { Resend } from 'resend'
import { supabase } from '../supabase.service'
import { loadVacancyStats, popularityScore, rankByPopularity } from '../vacancies/popularity'
import { modalityFromLabel } from '../vacancies/modality'
import { emailSiteUrl, trackedLink } from './links'
import { renderProfileReminder, type RenderedEmail, type ReminderVacancy } from './templates/profile-reminder'

/** El tipo de correo: una persona lo recibe una sola vez. */
export const REMINDER_KIND = 'perfil-pendiente-1'
/** Nombre de la campaña en los enlaces (utm_campaign): así el panel cuenta quién llegó desde este correo. */
export const REMINDER_CAMPAIGN = 'perfil-pendiente'
/** A quien se registró hace menos que esto todavía no se le recuerda nada: puede estar llenándolo. */
export const MIN_ACCOUNT_AGE_HOURS = 24
/** Una vacante cuenta como abierta durante este tiempo (igual que en el sitio). */
const OPEN_DAYS = 45

export interface AudienceUser {
  id: string
  email: string | null
  display_name: string | null
  name: string | null
  username: string | null
  provider: string | null
  user_kind: string | null
  is_test_account: boolean | null
  is_scraper_profile: boolean | null
  profile_completed: boolean | null
  email_opt_out: boolean | null
  created_at: string
}

export type Exclusion = 'completo' | 'prueba-o-scraper' | 'equipo-o-empresa' | 'sin-correo' | 'dio-de-baja' | 'muy-reciente' | 'ya-enviado'

/**
 * Por qué una persona NO recibe el recordatorio (o null si sí). Solo personas reales que se registraron, no
 * terminaron el perfil, tienen correo, no se dieron de baja, llevan al menos un día y no lo han recibido.
 */
export function exclusionFor(user: AudienceUser, alreadySent: Set<string>, now: Date = new Date(), minAgeHours: number = MIN_ACCOUNT_AGE_HOURS): Exclusion | null {
  if (user.is_test_account || user.is_scraper_profile) return 'prueba-o-scraper'
  if (user.user_kind !== 'user') return 'equipo-o-empresa'
  if (user.profile_completed) return 'completo'
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) return 'sin-correo'
  if (user.email_opt_out) return 'dio-de-baja'
  if (alreadySent.has(user.id)) return 'ya-enviado'
  if (now.getTime() - Date.parse(user.created_at) < minAgeHours * 3600000) return 'muy-reciente'
  return null
}

export const maskEmail = (email: string): string => {
  const [local, domain = ''] = email.split('@')
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(local.length - 1, 5)))}@${domain}`
}

export const firstName = (user: Pick<AudienceUser, 'display_name' | 'name' | 'username'>): string => {
  const full = (user.display_name || user.name || '').trim()
  return (full.split(/\s+/)[0] || user.username || 'hola').trim()
}

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

export interface Audience {
  eligible: AudienceUser[]
  /** Cuántas cuentas hay por cada razón de exclusión. */
  excluded: Record<Exclusion, number>
  /** Personas reales (sin equipo, pruebas ni scraper) y cuántas de ellas ya completaron el perfil. */
  realPeople: number
  completed: number
  /** false si todavía no se aplicó email-reminders-migration.sql: sin el registro de envíos no se manda. */
  ready: { optOut: boolean; log: boolean }
}

export async function loadAudience(kind: string = REMINDER_KIND, now: Date = new Date(), minAgeHours: number = MIN_ACCOUNT_AGE_HOURS): Promise<Audience> {
  const base = 'id, email, display_name, name, username, provider, user_kind, is_test_account, is_scraper_profile, profile_completed, created_at'
  const ready = { optOut: true, log: true }

  let users: AudienceUser[]
  try {
    users = await readAll<AudienceUser>((from, to) => supabase.from('users').select(`${base}, email_opt_out`).range(from, to) as never)
  } catch {
    ready.optOut = false
    users = (await readAll<AudienceUser>((from, to) => supabase.from('users').select(base).range(from, to) as never)).map(user => ({ ...user, email_opt_out: null }))
  }

  const alreadySent = new Set<string>()
  try {
    const sent = await readAll<{ user_id: string }>((from, to) => supabase.from('email_sends').select('user_id').eq('kind', kind).range(from, to) as never)
    for (const row of sent) alreadySent.add(row.user_id)
  } catch {
    ready.log = false
  }

  const excluded: Record<Exclusion, number> = { completo: 0, 'prueba-o-scraper': 0, 'equipo-o-empresa': 0, 'sin-correo': 0, 'dio-de-baja': 0, 'muy-reciente': 0, 'ya-enviado': 0 }
  const eligible: AudienceUser[] = []
  let realPeople = 0
  let completed = 0
  for (const user of users) {
    if (!user.is_test_account && !user.is_scraper_profile && user.user_kind === 'user') {
      realPeople += 1
      if (user.profile_completed) completed += 1
    }
    const reason = exclusionFor(user, alreadySent, now, minAgeHours)
    if (reason) excluded[reason] += 1
    else eligible.push(user)
  }
  eligible.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { eligible, excluded, realPeople, completed, ready }
}

interface VacancyRow {
  id: string
  slug: string
  title: string
  company: string | null
  modalidad: string | null
  seniority_level: string | null
  created_at: string
}

const SENIORITY: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }
const known = (value: string | null | undefined): value is string => !!value && value.trim() !== '' && !/no especificado|unknown/i.test(value)

export interface PickedVacancy extends ReminderVacancy {
  id: string
  slug: string
  score: number
}

/** La vacante abierta más popular (vistas + 3 × guardados + 5 × postulaciones); si nadie ha interactuado, la más reciente. */
export async function pickPopularVacancy(): Promise<{ vacancy: PickedVacancy; openVacancies: number } | null> {
  const since = new Date(Date.now() - OPEN_DAYS * 86400000).toISOString()
  const { data, count } = await supabase
    .from('community_posts')
    .select('id, slug, title, company, modalidad, seniority_level, created_at', { count: 'exact' })
    .eq('type', 'job')
    .not('slug', 'is', null)
    .not('role_category', 'is', null)
    .neq('role_category', 'otro')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(600)

  const rows = ((data ?? []) as VacancyRow[]).filter(row => row.slug && known(row.company))
  if (rows.length === 0) return null

  const statsOf = await loadVacancyStats()
  const top = rankByPopularity(rows, row => statsOf(row))[0]
  const score = popularityScore(statsOf(top))

  const meta = [
    top.company!.trim(),
    modalityFromLabel(top.modalidad) !== 'unknown' ? top.modalidad!.trim() : null,
    SENIORITY[top.seniority_level ?? ''] ?? null,
  ].filter(Boolean).join(' • ')

  return {
    openVacancies: count ?? rows.length,
    vacancy: {
      id: top.id,
      slug: top.slug,
      title: top.title.trim(),
      meta,
      url: trackedLink(`/vacantes/${top.slug}`, REMINDER_CAMPAIGN, 'vacante-popular'),
      label: score > 0 ? 'popular' : 'reciente',
      score,
    },
  }
}

export interface MailConfig {
  apiKey: string
  /** Remitente. Por defecto no-reply@avotalent.app. */
  from: string
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { config: MailConfig | null; missing: string[] } {
  if (!env.RESEND_API_KEY) return { config: null, missing: ['RESEND_API_KEY'] }
  return { missing: [], config: { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM || 'AvoTalent <no-reply@avotalent.app>' } }
}

/** El correo tal como le llega a una persona (también lo usa la vista previa). */
export function buildReminder(user: Pick<AudienceUser, 'display_name' | 'name' | 'username'>, picked: { vacancy: PickedVacancy; openVacancies: number }): RenderedEmail {
  return renderProfileReminder({
    name: firstName(user),
    completeProfileUrl: trackedLink('/onboarding', REMINDER_CAMPAIGN, 'boton-completar'),
    vacancy: picked.vacancy,
    openVacancies: picked.openVacancies,
  })
}

export interface SendResult {
  sent: number
  failed: { userId: string; error: string }[]
  skipped: number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Manda el recordatorio a cada persona. Antes de enviar anota la fila ('pending'): el UNIQUE (persona, tipo)
 * hace imposible mandarlo dos veces aunque dos ejecuciones corran a la vez. Resend permite 2 envíos por segundo.
 */
export async function sendReminders(users: AudienceUser[], picked: { vacancy: PickedVacancy; openVacancies: number }, config: MailConfig, kind: string = REMINDER_KIND): Promise<SendResult> {
  const resend = new Resend(config.apiKey)
  const result: SendResult = { sent: 0, failed: [], skipped: 0 }

  for (const user of users) {
    const claim = await supabase.from('email_sends').insert({ user_id: user.id, kind, vacancy_id: picked.vacancy.id, status: 'pending' })
    if (claim.error) { result.skipped += 1; continue }

    const email = buildReminder(user, picked)
    const { data, error } = await resend.emails.send({
      from: config.from,
      to: user.email!,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    if (error) {
      const message = `${error.name}: ${error.message}`
      await supabase.from('email_sends').update({ status: 'failed', error: message }).eq('user_id', user.id).eq('kind', kind)
      result.failed.push({ userId: user.id, error: message })
    } else {
      await supabase.from('email_sends').update({ status: 'sent', resend_id: data?.id ?? null }).eq('user_id', user.id).eq('kind', kind)
      result.sent += 1
    }
    await sleep(600)
  }
  return result
}

/** Cuántos correos salen como máximo en cada corrida diaria: si llegan muchos registros de golpe, no sale todo junto. */
export const DAILY_LIMIT = 20

export interface BatchDeps {
  loadAudience: typeof loadAudience
  pickPopularVacancy: typeof pickPopularVacancy
  sendReminders: typeof sendReminders
  mailConfig: () => { config: MailConfig | null; missing: string[] }
}

export type BatchOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; sent: number; failed: number; eligible: number }

/**
 * La corrida diaria: manda el recordatorio a quien le toca (máximo DAILY_LIMIT) con la vacante más popular del día.
 * Lo llama el cron (encendido con PROFILE_REMINDER_EMAILS=on) y no lanza errores: cualquier problema se devuelve
 * como 'skipped' para que el servidor siga funcionando.
 */
export async function runProfileReminderBatch(deps: BatchDeps = { loadAudience, pickPopularVacancy, sendReminders, mailConfig: mailConfigFromEnv }): Promise<BatchOutcome> {
  const { config, missing } = deps.mailConfig()
  if (!config) return { status: 'skipped', reason: `falta ${missing.join(', ')}` }

  const audience = await deps.loadAudience()
  if (!audience.ready.log) return { status: 'skipped', reason: 'falta aplicar email-reminders-migration.sql' }
  if (audience.eligible.length === 0) return { status: 'done', sent: 0, failed: 0, eligible: 0 }

  const picked = await deps.pickPopularVacancy()
  if (!picked) return { status: 'skipped', reason: 'no hay vacantes abiertas para destacar' }

  const result = await deps.sendReminders(audience.eligible.slice(0, DAILY_LIMIT), picked, config)
  return { status: 'done', sent: result.sent, failed: result.failed.length, eligible: audience.eligible.length }
}

import { Resend } from 'resend'
import { supabase } from '../supabase.service'
import { remainingBudget } from './budget'
import { trackedLink } from './links'
import { firstName, mailConfigFromEnv, pickTopVacancies, type AudienceUser, type MailConfig, type PickedVacancy } from './profile-reminder'
import { renderFounders, renderWelcome } from './templates/welcome'
import type { RenderedEmail } from './templates/profile-reminder'

/** Tipos de correo (una persona recibe cada uno una sola vez): la bienvenida de quien se registra y la de los primeros miembros. */
export const WELCOME_KIND = 'bienvenida-1'
export const FOUNDERS_KIND = 'bienvenida-fundadores'

/**
 * Quien se registró ANTES de esta fecha ya estaba cuando nació el correo de bienvenida: recibe el de "primeros
 * miembros" (si completó su perfil). Quien se registra DESPUÉS recibe la bienvenida normal, con sus pasos.
 * Es 12:00 de Monterrey del 29 de octubre de 2026, la hora de la tanda de los primeros miembros.
 */
export const WELCOME_CUTOFF = new Date('2026-10-29T18:00:00Z')
/** La bienvenida sale unos 15 minutos después del registro (el proceso corre cada 15): no antes de 10. */
export const WELCOME_MIN_AGE_MINUTES = 10
/** Si por algo no salió, no se manda a quien se registró hace más de esto (una bienvenida tardía confunde). */
export const WELCOME_MAX_AGE_DAYS = 7
/** Cuántos correos de bienvenida salen como máximo en cada corrida. */
export const WELCOME_RUN_LIMIT = 15

export type WelcomeAudience = 'new' | 'founders'

/**
 * A quién le toca cada bienvenida. Solo personas reales con correo válido que no se dieron de baja y que no han
 * recibido ya una bienvenida (de ningún tipo). Pura: no toca la base.
 */
export function welcomeAudienceOf(user: AudienceUser, alreadyWelcomed: Set<string>, now: Date = new Date()): WelcomeAudience | null {
  if (user.is_test_account || user.is_scraper_profile || user.user_kind !== 'user') return null
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || user.email_opt_out) return null
  if (alreadyWelcomed.has(user.id)) return null

  const created = Date.parse(user.created_at)
  if (created >= WELCOME_CUTOFF.getTime()) {
    const age = now.getTime() - created
    return age >= WELCOME_MIN_AGE_MINUTES * 60000 && age <= WELCOME_MAX_AGE_DAYS * 86400000 ? 'new' : null
  }
  return user.profile_completed ? 'founders' : null
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

export interface WelcomeCandidates {
  new: AudienceUser[]
  founders: AudienceUser[]
  /** false si falta aplicar email-reminders-migration.sql (sin el registro de envíos no se manda). */
  ready: boolean
}

export async function loadWelcomeCandidates(now: Date = new Date()): Promise<WelcomeCandidates> {
  const columns = 'id, email, display_name, name, username, provider, user_kind, is_test_account, is_scraper_profile, profile_completed, email_opt_out, created_at'
  const users = await readAll<AudienceUser>((from, to) => supabase.from('users').select(columns).range(from, to) as never)

  const welcomed = new Set<string>()
  let ready = true
  try {
    for (const kind of [WELCOME_KIND, FOUNDERS_KIND]) {
      const sent = await readAll<{ user_id: string }>((from, to) => supabase.from('email_sends').select('user_id').eq('kind', kind).range(from, to) as never)
      for (const row of sent) welcomed.add(row.user_id)
    }
  } catch {
    ready = false
  }

  const result: WelcomeCandidates = { new: [], founders: [], ready }
  for (const user of users) {
    const audience = welcomeAudienceOf(user, welcomed, now)
    if (audience) result[audience].push(user)
  }
  result.new.sort((a, b) => a.created_at.localeCompare(b.created_at))
  result.founders.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return result
}

/** El correo de una persona, según el grupo. */
export function buildWelcome(audience: WelcomeAudience, user: Pick<AudienceUser, 'display_name' | 'name' | 'username' | 'profile_completed'>, vacancy: PickedVacancy | null, openVacancies: number): RenderedEmail {
  const name = firstName(user) === 'hola' ? null : firstName(user)
  if (audience === 'founders') {
    return renderFounders({ name, ctaUrl: trackedLink('/', 'bienvenida-fundadores', 'boton', 'bienvenida'), vacancy, openVacancies })
  }
  const completed = !!user.profile_completed
  return renderWelcome({
    name,
    profileCompleted: completed,
    ctaUrl: trackedLink(completed ? '/' : '/onboarding', 'bienvenida-nuevos', 'boton', 'bienvenida'),
    vacancy,
    openVacancies,
  })
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface WelcomeDeps {
  mailConfig: () => { config: MailConfig | null; missing: string[] }
  loadCandidates: () => Promise<WelcomeCandidates>
  remainingBudget: () => Promise<number>
  loadVacancy: (audience: WelcomeAudience) => Promise<{ vacancy: PickedVacancy | null; openVacancies: number }>
  deliver: (user: AudienceUser, kind: string, vacancyId: string | null, email: RenderedEmail, config: MailConfig) => Promise<{ ok: boolean; error?: string }>
}

/** Anota la fila ('pending') ANTES de enviar: el UNIQUE (persona, tipo) impide mandarlo dos veces aunque corran dos procesos a la vez. */
export async function deliverWelcome(user: AudienceUser, kind: string, vacancyId: string | null, email: RenderedEmail, config: MailConfig): Promise<{ ok: boolean; error?: string }> {
  const claim = await supabase.from('email_sends').insert({ user_id: user.id, kind, vacancy_id: vacancyId, status: 'pending' })
  if (claim.error) return { ok: false, error: 'ya tenía registro' }
  const { data, error } = await new Resend(config.apiKey).emails.send({ from: config.from, replyTo: config.replyTo, to: user.email!, subject: email.subject, html: email.html, text: email.text })
  if (error) {
    const message = `${error.name}: ${error.message}`
    await supabase.from('email_sends').update({ status: 'failed', error: message }).eq('user_id', user.id).eq('kind', kind)
    return { ok: false, error: message }
  }
  await supabase.from('email_sends').update({ status: 'sent', resend_id: data?.id ?? null }).eq('user_id', user.id).eq('kind', kind)
  await sleep(600)
  return { ok: true }
}

export const defaultWelcomeDeps: WelcomeDeps = {
  mailConfig: mailConfigFromEnv,
  loadCandidates: () => loadWelcomeCandidates(),
  remainingBudget: () => remainingBudget(),
  loadVacancy: async audience => {
    const campaign = audience === 'founders' ? 'bienvenida-fundadores' : 'bienvenida-nuevos'
    const { vacancies, openVacancies } = await pickTopVacancies(1, campaign, 'vacante-popular', 'bienvenida')
    return { vacancy: vacancies[0] ?? null, openVacancies }
  },
  deliver: deliverWelcome,
}

export type WelcomeOutcome = { status: 'skipped'; reason: string } | { status: 'done'; sent: number; failed: number; waiting: number }

/**
 * Una corrida de bienvenidas para un grupo ('new' cada 15 minutos, 'founders' en la tanda de los primeros miembros).
 * Nunca lanza errores y nunca pasa del cupo diario compartido de correos.
 */
export async function runWelcomeBatch(audience: WelcomeAudience, deps: WelcomeDeps = defaultWelcomeDeps, options: { limit?: number } = {}): Promise<WelcomeOutcome> {
  const { config, missing } = deps.mailConfig()
  if (!config) return { status: 'skipped', reason: `falta ${missing.join(', ')}` }

  const candidates = await deps.loadCandidates()
  if (!candidates.ready) return { status: 'skipped', reason: 'falta aplicar email-reminders-migration.sql' }
  const people = candidates[audience]
  if (people.length === 0) return { status: 'done', sent: 0, failed: 0, waiting: 0 }

  const room = Math.min(options.limit ?? (audience === 'new' ? WELCOME_RUN_LIMIT : Infinity), await deps.remainingBudget())
  if (room <= 0) return { status: 'skipped', reason: 'ya se usó el cupo de correos de hoy' }

  const { vacancy, openVacancies } = await deps.loadVacancy(audience)
  const kind = audience === 'founders' ? FOUNDERS_KIND : WELCOME_KIND
  let sent = 0
  let failed = 0
  for (const user of people.slice(0, room)) {
    const result = await deps.deliver(user, kind, vacancy?.id ?? null, buildWelcome(audience, user, vacancy, openVacancies), config)
    if (result.ok) sent += 1
    else failed += 1
  }
  return { status: 'done', sent, failed, waiting: Math.max(0, people.length - room) }
}

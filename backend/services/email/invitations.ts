import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import { supabase } from '../supabase.service'
import { RESERVE, isQuotaError, monterreyDayStart, remainingBudget, sendTracked } from './budget'
import { trackedLink } from './links'
import { mailConfigFromEnv, pickTopVacancies, type MailConfig, type PickedVacancy } from './profile-reminder'
import { renderInvitation1, renderInvitation2 } from './templates/invitation'
import type { RenderedEmail } from './templates/profile-reminder'

/** Días entre la primera invitación y la segunda (la última). */
export const GAP_DAYS = 5
/** Calentamiento: el primer día salen pocos, el segundo algo más y de ahí el tope normal. Una lista fría que recibe todo de golpe cae en spam. */
export const WARMUP = [20, 40]
export const FULL_DAILY = 70

export interface Invitation {
  id: string
  code: string
  email: string
  first_name: string | null
  source: string
  position: number
  suppressed: boolean
  user_id: string | null
}

export interface InviteSend {
  invitation_id: string
  step: 1 | 2
  status: 'pending' | 'sent' | 'failed'
  resend_id: string | null
  last_event: string | null
  created_at: string
}

export interface Contact {
  email: string
  firstName: string | null
  source: string
}

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/

/** "ANA MARÍA PÉREZ" → "Ana". Sin nombre usable, null (el correo dice "Hola" a secas). */
export function firstNameOf(full: string | null | undefined): string | null {
  const token = (full ?? '').trim().split(/\s+/)[0] ?? ''
  if (token.length < 2 || /[\d@_]/.test(token)) return null
  return token.charAt(0).toLocaleUpperCase('es-MX') + token.slice(1).toLocaleLowerCase('es-MX')
}

/** Correos en minúsculas, sin repetidos ni inválidos; si un correo aparece dos veces se queda con el nombre que sí traiga. La primera aparición manda en el orden. */
export function normalizeContacts(rows: { email: string; name: string; source: string }[]): Contact[] {
  const byEmail = new Map<string, Contact>()
  for (const row of rows) {
    const email = row.email.trim().toLowerCase()
    if (!EMAIL.test(email)) continue
    const firstName = firstNameOf(row.name)
    const known = byEmail.get(email)
    if (!known) byEmail.set(email, { email, firstName, source: row.source })
    else if (!known.firstName && firstName) known.firstName = firstName
  }
  return [...byEmail.values()]
}

export const newInviteCode = (): string => randomBytes(5).toString('hex')

/** Cuántos días distintos (antes de hoy) ya salieron invitaciones: define el calentamiento. */
export function activeDaysBefore(sends: Pick<InviteSend, 'created_at' | 'status'>[], now: Date): number {
  const today = monterreyDayStart(now).getTime()
  const days = new Set<number>()
  for (const send of sends) {
    if (send.status !== 'sent') continue
    const day = monterreyDayStart(new Date(send.created_at)).getTime()
    if (day < today) days.add(day)
  }
  return days.size
}

export const dailyCap = (daysAlreadySending: number): number => WARMUP[daysAlreadySending] ?? FULL_DAILY

/**
 * A quién le toca hoy. La segunda invitación va primero (esas personas llevan más tiempo esperando) y solo si pasaron
 * GAP_DAYS, no se registró y no pidió salir; la primera, en el orden de la cola. Nunca se manda a quien ya se
 * registró, rebotó o marcó spam, ni se repite un paso (aunque haya fallado: no se reintenta solo).
 */
export function pickDue(invitations: Invitation[], sends: InviteSend[], now: Date, gapDays: number = GAP_DAYS): { step1: Invitation[]; step2: Invitation[] } {
  const steps = new Map<string, Map<number, InviteSend>>()
  for (const send of sends) {
    if (!steps.has(send.invitation_id)) steps.set(send.invitation_id, new Map())
    steps.get(send.invitation_id)!.set(send.step, send)
  }

  const ready = invitations.filter(inv => !inv.suppressed && !inv.user_id).sort((a, b) => a.position - b.position)
  const limit = now.getTime() - gapDays * 86400000
  const step2 = ready.filter(inv => {
    const done = steps.get(inv.id)
    const first = done?.get(1)
    return !!first && first.status === 'sent' && Date.parse(first.created_at) <= limit && !done!.has(2)
  })
  const step1 = ready.filter(inv => !steps.get(inv.id)?.has(1))
  return { step1, step2 }
}

/** El correo de una persona: sus enlaces llevan su código para saber quién se registró desde cuál invitación. */
export function buildInvitation(inv: Pick<Invitation, 'code' | 'first_name'>, step: 1 | 2, vacancies: PickedVacancy[], openVacancies: number): RenderedEmail {
  const campaign = `invitacion-${step}`
  const link = (path: string) => trackedLink(path, campaign, inv.code, 'invitacion')
  const shown = (step === 1 ? vacancies.slice(0, 1) : vacancies.slice(0, 3)).map(vacancy => ({ ...vacancy, url: link(`/vacantes/${vacancy.slug}`) }))
  const data = { name: inv.first_name, signupUrl: link('/signup'), openVacancies, vacancies: shown }
  return step === 1 ? renderInvitation1(data) : renderInvitation2(data)
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

export async function loadState(): Promise<{ invitations: Invitation[]; sends: InviteSend[] }> {
  const invitations = await readAll<Invitation>((from, to) => supabase.from('invitations').select('id, code, email, first_name, source, position, suppressed, user_id').order('position').range(from, to) as never)
  const sends = await readAll<InviteSend>((from, to) => supabase.from('invitation_sends').select('invitation_id, step, status, resend_id, last_event, created_at').range(from, to) as never)
  return { invitations, sends }
}

/**
 * Liga cada invitación con la cuenta que se registró: por el código del enlace (signup_content) o, si entró sin el
 * enlace, por el mismo correo. Quien ya tiene cuenta deja de recibir invitaciones.
 */
export async function linkRegistrations(): Promise<number> {
  const { data: pending } = await supabase.from('invitations').select('id, code, email').is('user_id', null)
  if (!pending || pending.length === 0) return 0

  const users = await readAll<{ id: string; email: string | null; signup_content: string | null; created_at: string }>((from, to) => supabase.from('users').select('id, email, signup_content, created_at').range(from, to) as never)
  const byEmail = new Map(users.filter(user => user.email).map(user => [user.email!.toLowerCase(), user]))
  const byCode = new Map(users.filter(user => user.signup_content).map(user => [user.signup_content!, user]))

  let linked = 0
  for (const inv of pending as { id: string; code: string; email: string }[]) {
    const user = byCode.get(inv.code) ?? byEmail.get(inv.email.toLowerCase())
    if (!user) continue
    await supabase.from('invitations').update({ user_id: user.id, registered_at: user.created_at }).eq('id', inv.id)
    linked += 1
  }
  return linked
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const OPEN_STATES = [null, 'sent', 'delivered', 'delivery_delayed']

/** Pregunta a Resend qué pasó con los correos recientes (entregado, abierto, clic, rebote…). Quien rebota o marca spam queda fuera de la lista. */
export async function refreshEvents(config: MailConfig, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 10 * 86400000).toISOString()
  const { data } = await supabase.from('invitation_sends').select('invitation_id, step, resend_id, last_event').eq('status', 'sent').not('resend_id', 'is', null).gte('created_at', since).limit(150)
  const rows = ((data ?? []) as { invitation_id: string; step: number; resend_id: string; last_event: string | null }[]).filter(row => OPEN_STATES.includes(row.last_event))
  const resend = new Resend(config.apiKey)

  let updated = 0
  for (const row of rows) {
    const { data: email, error } = await resend.emails.get(row.resend_id)
    if (error) {
      // Una llave de Resend que solo puede enviar ("Sending access") no puede leer estados: se avisa en vez de callar.
      console.warn(`[Invitaciones] No se pueden leer los estados de Resend (${error.name}: ${error.message}). Usa una llave con acceso completo o un webhook.`)
      break
    }
    const event = (email as { last_event?: string } | null)?.last_event
    if (event && event !== row.last_event) {
      await supabase.from('invitation_sends').update({ last_event: event, last_event_at: new Date().toISOString() }).eq('invitation_id', row.invitation_id).eq('step', row.step)
      if (event === 'bounced' || event === 'complained') await supabase.from('invitations').update({ suppressed: true, suppressed_reason: event }).eq('id', row.invitation_id)
      updated += 1
    }
    await sleep(600)
  }
  return updated
}

export interface InviteDeps {
  mailConfig: () => { config: MailConfig | null; missing: string[] }
  prepare: (config: MailConfig) => Promise<void>
  loadState: typeof loadState
  remainingBudget: () => Promise<number>
  loadVacancies: () => Promise<{ vacancies: PickedVacancy[]; openVacancies: number }>
  deliver: (invitation: Invitation, step: 1 | 2, email: RenderedEmail, config: MailConfig) => Promise<{ ok: boolean; error?: string; quota?: boolean }>
  now: () => Date
}

export type InviteOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; sent: number; failed: number; step1: number; step2: number; cap: number; waiting: number }

/** Manda un correo y lo anota: la fila 'pending' se crea ANTES de enviar, así dos corridas a la vez no mandan lo mismo. */
export async function deliverInvitation(invitation: Invitation, step: 1 | 2, email: RenderedEmail, config: MailConfig): Promise<{ ok: boolean; error?: string; quota?: boolean }> {
  const claim = await supabase.from('invitation_sends').insert({ invitation_id: invitation.id, step, status: 'pending' })
  if (claim.error) return { ok: false, error: 'ya tenía registro' }
  const { data, error } = await sendTracked(new Resend(config.apiKey), { from: config.from, replyTo: config.replyTo, to: invitation.email, subject: email.subject, html: email.html, text: email.text }, 'invitacion')
  if (error && isQuotaError(error)) {
    // Se acabó el cupo de 24 horas: se libera su lugar para la próxima corrida.
    await supabase.from('invitation_sends').delete().eq('invitation_id', invitation.id).eq('step', step)
    return { ok: false, error: 'sin cupo', quota: true }
  }
  if (error) {
    const message = `${error.name}: ${error.message}`
    await supabase.from('invitation_sends').update({ status: 'failed', error: message }).eq('invitation_id', invitation.id).eq('step', step)
    return { ok: false, error: message }
  }
  await supabase.from('invitation_sends').update({ status: 'sent', resend_id: data?.id ?? null }).eq('invitation_id', invitation.id).eq('step', step)
  // Resend permite 2 envíos por segundo.
  await sleep(600)
  return { ok: true }
}

export const defaultInviteDeps: InviteDeps = {
  mailConfig: mailConfigFromEnv,
  prepare: async config => { await linkRegistrations(); await refreshEvents(config) },
  loadState,
  remainingBudget: () => remainingBudget(new Date(), RESERVE.invitations),
  loadVacancies: async () => {
    const { vacancies, openVacancies } = await pickTopVacancies(3, 'invitacion', 'x', 'invitacion')
    return { vacancies, openVacancies }
  },
  deliver: deliverInvitation,
  now: () => new Date(),
}

/**
 * La corrida diaria de invitaciones: primero ve quién ya se registró y qué pasó con lo enviado, luego manda lo que
 * toca sin pasar del tope del día (calentamiento) ni del presupuesto compartido de correos.
 */
export async function runInvitationBatch(deps: InviteDeps = defaultInviteDeps, options: { limit?: number } = {}): Promise<InviteOutcome> {
  const { config, missing } = deps.mailConfig()
  if (!config) return { status: 'skipped', reason: `falta ${missing.join(', ')}` }

  await deps.prepare(config)
  const { invitations, sends } = await deps.loadState()
  const now = deps.now()
  const cap = Math.min(dailyCap(activeDaysBefore(sends, now)), options.limit ?? Infinity)
  const budget = Math.min(cap, await deps.remainingBudget())
  const due = pickDue(invitations, sends, now)
  const queue = [...due.step2.map(inv => ({ inv, step: 2 as const })), ...due.step1.map(inv => ({ inv, step: 1 as const }))]
  if (queue.length === 0) return { status: 'done', sent: 0, failed: 0, step1: 0, step2: 0, cap, waiting: 0 }
  if (budget <= 0) return { status: 'skipped', reason: 'ya se usó el cupo de correos de hoy' }

  const { vacancies, openVacancies } = await deps.loadVacancies()
  if (vacancies.length === 0) return { status: 'skipped', reason: 'no hay vacantes abiertas para destacar' }

  let sent = 0
  let failed = 0
  let step1 = 0
  let step2 = 0
  for (const { inv, step } of queue.slice(0, budget)) {
    const result = await deps.deliver(inv, step, buildInvitation(inv, step, vacancies, openVacancies), config)
    if (result.ok) { sent += 1; if (step === 1) step1 += 1; else step2 += 1 } else if (result.quota) break
    else failed += 1
  }
  return { status: 'done', sent, failed, step1, step2, cap, waiting: Math.max(0, queue.length - budget) }
}

import { Resend } from 'resend'
import { supabase } from '../supabase.service'
import { notify } from '../notifications/notify'
import { RESERVE, isQuotaError, remainingBudget, sendTracked } from '../email/budget'
import { trackedLink } from '../email/links'
import { firstName, mailConfigFromEnv, type MailConfig } from '../email/profile-reminder'
import { renderFollowup } from '../email/templates/followup'
import type { RenderedEmail } from '../email/templates/profile-reminder'
import { followupKind, type ApplicationRow } from './applications'

/**
 * Seguimiento de «Mis postulaciones»: a los 5 días de haberse postulado, «¿Cómo te fue con X?» (aviso dentro de la app y, si lo quiere,
 * un correo), y a quien salió a postularse y nunca contestó, un solo recordatorio dentro de la app a los 2 días.
 *
 * Topes: un aviso por persona por corrida (varias postulaciones juntas se agrupan en uno), cada postulación se avisa una sola vez
 * (`followup_notified_at`) y como máximo UN correo de seguimiento por persona por semana. El correo gasta del cupo diario compartido
 * (con la misma reserva que las alertas); el aviso dentro de la app no gasta nada. Apagado hasta que APPLICATION_FOLLOWUPS=on.
 */
export const FOLLOWUP_EMAIL_GAP_DAYS = 7
export const FOLLOWUP_EMAILS_PER_RUN = 15
/** Cuántas postulaciones se nombran en el correo (el resto se cuenta). */
export const FOLLOWUP_ITEMS_IN_EMAIL = 3

export interface FollowupPerson {
  id: string
  email: string | null
  display_name: string | null
  name: string | null
  username: string | null
  email_opt_out: boolean | null
  email_prefs: { followups?: boolean } | null
}

export type DueApplication = ApplicationRow & { kind: 'applied' | 'unanswered' }

export interface FollowupPlan {
  person: FollowupPerson
  /** La más antigua primero. */
  items: DueApplication[]
  /** Además del aviso en la app, ¿se le manda correo? */
  email: boolean
}

const validEmail = (person: FollowupPerson) => !!person.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) && !person.email_opt_out

/** Quién recibe qué. Pura: recibe las filas, las personas elegibles y quién ya recibió un correo de seguimiento esta semana. */
export function planFollowups(rows: ApplicationRow[], people: Map<string, FollowupPerson>, emailedRecently: Set<string>, now: Date = new Date()): FollowupPlan[] {
  const byPerson = new Map<string, DueApplication[]>()
  for (const row of rows) {
    const kind = followupKind(row, now)
    if (!kind || !people.has(row.user_id)) continue
    byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), { ...row, kind }])
  }
  const plans: FollowupPlan[] = []
  for (const [userId, due] of byPerson) {
    const person = people.get(userId)!
    const items = due.sort((a, b) => Date.parse(a.clicked_at) - Date.parse(b.clicked_at))
    // El correo solo es para quien SÍ se postuló: a quien nunca contestó basta un aviso dentro de la app.
    const email = items.some(item => item.kind === 'applied') && validEmail(person) && person.email_prefs?.followups !== false && !emailedRecently.has(userId)
    plans.push({ person, items, email })
  }
  return plans
}

const company = (item: ApplicationRow) => (item.company ? ` en ${item.company.trim()}` : '')
const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** El texto del aviso dentro de la app (uno por persona por corrida). */
export function noticeMessage(plan: FollowupPlan): string {
  if (plan.items.length > 1) return `¿Cómo van tus ${plan.items.length} postulaciones? Cuéntanos y actualiza su estado.`
  const [item] = plan.items
  return item.kind === 'applied'
    ? `¿Cómo te fue con «${short(item.title.trim())}»${company(item)}? Cuéntanos y actualiza su estado.`
    : `¿Llegaste a postularte a «${short(item.title.trim())}»${company(item)}? Márcalo en Mis postulaciones.`
}

// ---------- datos ----------

export interface FollowupDeps {
  mailConfig: () => { config: MailConfig | null; missing: string[] }
  loadDue: (now: Date) => Promise<ApplicationRow[]>
  loadPeople: (ids: string[]) => Promise<Map<string, FollowupPerson>>
  loadEmailedRecently: (ids: string[], now: Date) => Promise<Set<string>>
  remainingBudget: (reserve: number) => Promise<number>
  notice: (person: FollowupPerson, message: string) => Promise<void>
  markNotified: (ids: string[], now: Date) => Promise<void>
  markEmailed: (ids: string[], now: Date) => Promise<void>
  sendEmail: (person: FollowupPerson, email: RenderedEmail, config: MailConfig) => Promise<{ ok: boolean; quota?: boolean }>
  now: () => Date
}

export const defaultFollowupDeps: FollowupDeps = {
  mailConfig: mailConfigFromEnv,
  loadDue: async (now) => {
    // Lo candidato: nunca avisadas, postuladas o sin contestar. followupKind decide cuáles ya tocan.
    const { data, error } = await supabase.from('vacancy_applications').select('*').in('status', ['applied', 'clicked']).is('followup_notified_at', null)
      .gte('clicked_at', new Date(now.getTime() - 120 * 86_400_000).toISOString()).limit(2000)
    if (error) throw new Error(error.message)
    return (data ?? []) as ApplicationRow[]
  },
  loadPeople: async (ids) => {
    const people = new Map<string, FollowupPerson>()
    if (ids.length === 0) return people
    const columns = 'id, email, display_name, name, username, email_opt_out, email_prefs, user_kind, is_test_account, is_scraper_profile'
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('users').select(columns).in('id', ids.slice(i, i + 200))
      for (const row of (data ?? []) as (FollowupPerson & { user_kind: string; is_test_account: boolean | null; is_scraper_profile: boolean | null })[]) {
        if (row.user_kind === 'user' && !row.is_test_account && !row.is_scraper_profile) people.set(row.id, row)
      }
    }
    return people
  },
  loadEmailedRecently: async (ids, now) => {
    const out = new Set<string>()
    if (ids.length === 0) return out
    const since = new Date(now.getTime() - FOLLOWUP_EMAIL_GAP_DAYS * 86_400_000).toISOString()
    const { data } = await supabase.from('vacancy_applications').select('user_id').in('user_id', ids).gte('followup_emailed_at', since)
    for (const row of (data ?? []) as { user_id: string }[]) out.add(row.user_id)
    return out
  },
  remainingBudget: reserve => remainingBudget(new Date(), reserve),
  notice: async (person, message) => { await notify({ userId: person.id, type: 'application', message, link: '/postulaciones' }) },
  markNotified: async (ids, now) => { await supabase.from('vacancy_applications').update({ followup_notified_at: now.toISOString() }).in('id', ids) },
  markEmailed: async (ids, now) => { await supabase.from('vacancy_applications').update({ followup_emailed_at: now.toISOString() }).in('id', ids) },
  sendEmail: async (person, email, config) => {
    const { error } = await sendTracked(new Resend(config.apiKey), { from: config.from, replyTo: config.replyTo, to: person.email!, subject: email.subject, html: email.html, text: email.text }, 'seguimiento-postulacion')
    if (error) return { ok: false, quota: isQuotaError(error) }
    await new Promise(resolve => setTimeout(resolve, 600))
    return { ok: true }
  },
  now: () => new Date(),
}

export type FollowupOutcome = { status: 'skipped'; reason: string } | { status: 'done'; planned: number; notified: number; emailed: number; waiting: number }

export function buildFollowupEmail(plan: FollowupPlan): RenderedEmail {
  const applied = plan.items.filter(item => item.kind === 'applied')
  const shown = applied.slice(0, FOLLOWUP_ITEMS_IN_EMAIL)
  return renderFollowup({
    name: (() => { const name = firstName(plan.person as never); return name === 'hola' ? null : name })(),
    items: shown.map(item => ({ title: item.title, company: item.company })),
    more: applied.length - shown.length,
    url: trackedLink('/postulaciones', 'seguimiento-postulacion', 'boton-actualizar', 'seguimiento'),
  })
}

/** La corrida diaria. Sin la tabla (migración sin correr) no hace nada y lo dice. */
export async function runApplicationFollowups(deps: FollowupDeps = defaultFollowupDeps): Promise<FollowupOutcome> {
  const now = deps.now()
  let rows: ApplicationRow[]
  try {
    rows = await deps.loadDue(now)
  } catch {
    return { status: 'skipped', reason: 'falta aplicar vacancy-applications-migration.sql' }
  }
  const due = rows.filter(row => followupKind(row, now))
  if (due.length === 0) return { status: 'done', planned: 0, notified: 0, emailed: 0, waiting: 0 }

  const ids = [...new Set(due.map(row => row.user_id))]
  const [people, emailedRecently] = await Promise.all([deps.loadPeople(ids), deps.loadEmailedRecently(ids, now)])
  const plans = planFollowups(due, people, emailedRecently, now)
  const { config } = deps.mailConfig()
  let room = Math.min(FOLLOWUP_EMAILS_PER_RUN, await deps.remainingBudget(RESERVE.alerts))
  let notified = 0
  let emailed = 0
  let waiting = 0

  for (const plan of plans) {
    await deps.notice(plan.person, noticeMessage(plan))
    await deps.markNotified(plan.items.map(item => item.id), now)
    notified += 1
    if (!plan.email || !config) continue
    if (room <= 0) { waiting += 1; continue }
    const sent = await deps.sendEmail(plan.person, buildFollowupEmail(plan), config)
    if (sent.quota) { room = 0; waiting += 1; continue }
    if (sent.ok) {
      emailed += 1
      room -= 1
      await deps.markEmailed(plan.items.filter(item => item.kind === 'applied').map(item => item.id), now)
    }
  }
  return { status: 'done', planned: plans.length, notified, emailed, waiting }
}

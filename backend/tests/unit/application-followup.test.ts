import { describe, it, expect, vi } from 'vitest'

vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: { from: () => ({}) } }))

import { buildFollowupEmail, noticeMessage, planFollowups, runApplicationFollowups, type FollowupDeps, type FollowupPerson } from '@avotalent/core/services/applications/followup'
import { renderFollowup, FOLLOWUP_SUBJECT } from '@avotalent/core/services/email/templates/followup'
import type { ApplicationRow } from '@avotalent/core/services/applications/applications'

const now = new Date('2026-11-10T16:20:00Z')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

const row = (patch: Partial<ApplicationRow> & { id: string }): ApplicationRow => ({
  user_id: 'ana', vacancy_id: `v-${patch.id}`, vacancy_slug: 's', title: 'Backend Engineer', company: 'Stripe', apply_host: null, status: 'applied', remind_at: null,
  clicked_at: ago(8), answered_at: ago(8), applied_at: ago(6), followup_notified_at: null, followup_emailed_at: null, updated_at: ago(6), ...patch,
})
const person = (patch: Partial<FollowupPerson> = {}): FollowupPerson => ({ id: 'ana', email: 'ana@example.com', display_name: 'Ana López', name: null, username: 'ana', email_opt_out: false, email_prefs: null, ...patch })
const people = (...list: FollowupPerson[]) => new Map(list.map(p => [p.id, p]))

describe('planFollowups', () => {
  it('asks about an application 5 days after it was marked as applied, with a notice and an email', () => {
    const [plan] = planFollowups([row({ id: '1' })], people(person()), new Set(), now)
    expect(plan.items.map(item => item.id)).toEqual(['1'])
    expect(plan.email).toBe(true)
  })

  it('does not ask before 5 days, nor twice, nor about one that already moved on', () => {
    expect(planFollowups([row({ id: '1', applied_at: ago(4) })], people(person()), new Set(), now)).toEqual([])
    expect(planFollowups([row({ id: '1', followup_notified_at: ago(1) })], people(person()), new Set(), now)).toEqual([])
    expect(planFollowups([row({ id: '1', status: 'interview' })], people(person()), new Set(), now)).toEqual([])
  })

  it('groups several applications of one person into ONE notice, the oldest first', () => {
    const rows = [row({ id: 'nueva', applied_at: ago(5), clicked_at: ago(6), title: 'Nueva' }), row({ id: 'vieja', applied_at: ago(9), clicked_at: ago(10), title: 'Vieja' })]
    const plans = planFollowups(rows, people(person()), new Set(), now)
    expect(plans).toHaveLength(1)
    expect(plans[0].items.map(item => item.id)).toEqual(['vieja', 'nueva'])
    expect(noticeMessage(plans[0])).toBe('¿Cómo van tus 2 postulaciones? Cuéntanos y actualiza su estado.')
  })

  it('whoever left to apply and never answered gets a single reminder in the app, and never an email', () => {
    const [plan] = planFollowups([row({ id: '1', status: 'clicked', applied_at: null, answered_at: null, clicked_at: ago(3) })], people(person()), new Set(), now)
    expect(plan.items[0].kind).toBe('unanswered')
    expect(plan.email).toBe(false)
    expect(noticeMessage(plan)).toContain('¿Llegaste a postularte a «Backend Engineer» en Stripe?')
  })

  it('the email respects who does not want it, invalid addresses, opt-out, and one per person per week', () => {
    const base = [row({ id: '1' })]
    expect(planFollowups(base, people(person({ email_prefs: { followups: false } })), new Set(), now)[0].email).toBe(false)
    expect(planFollowups(base, people(person({ email_opt_out: true })), new Set(), now)[0].email).toBe(false)
    expect(planFollowups(base, people(person({ email: 'no-es-correo' })), new Set(), now)[0].email).toBe(false)
    expect(planFollowups(base, people(person({ email: null })), new Set(), now)[0].email).toBe(false)
    expect(planFollowups(base, people(person()), new Set(['ana']), now)[0].email).toBe(false)
    // pero el aviso en la app sale igual
    expect(planFollowups(base, people(person({ email_opt_out: true })), new Set(), now)).toHaveLength(1)
  })

  it('ignores people who are not eligible (not in the map: team, tests, scraper profiles)', () => {
    expect(planFollowups([row({ id: '1', user_id: 'equipo' })], people(person()), new Set(), now)).toEqual([])
  })
})

describe('the email', () => {
  const plan = (n: number) => ({
    person: person(),
    email: true,
    items: Array.from({ length: n }, (_, i) => ({ ...row({ id: String(i), title: `Vacante ${i + 1}`, company: `Empresa ${i + 1}` }), kind: 'applied' as const })),
  })

  it('is short, names the vacancy, has one button to Mis postulaciones and says how to switch it off', () => {
    const email = buildFollowupEmail(plan(1))
    expect(email.subject).toBe('¿Cómo te fue con «Vacante 1» en Empresa 1?')
    expect(email.html).toContain('/postulaciones?utm_source=email&amp;utm_medium=seguimiento&amp;utm_campaign=seguimiento-postulacion')
    expect(email.html).toContain('Actualizar mis postulaciones')
    expect(email.text).toContain('Ajustes > Notificaciones')
    expect(email.html).toContain('Hola, <strong')
    expect(email.html).toContain('Ana')
  })

  it('names up to 3 applications and counts the rest', () => {
    const email = buildFollowupEmail(plan(5))
    expect(email.html).toContain('Vacante 1')
    expect(email.html).toContain('Vacante 3')
    expect(email.html).not.toContain('Vacante 4')
    expect(email.html).toContain('Y 2 más')
    expect(email.subject).toContain('¿Cómo van tus postulaciones?')
  })

  it('never lets a vacancy title inject HTML into the email', () => {
    const html = renderFollowup({ name: 'Ana', items: [{ title: '<img src=x onerror=alert(1)>', company: 'A&B' }], more: 0, url: 'https://avotalent.app/postulaciones' }).html
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(FOLLOWUP_SUBJECT([{ title: 'T', company: null }], 0)).toBe('¿Cómo te fue con «T»?')
  })
})

describe('runApplicationFollowups', () => {
  function deps(rows: ApplicationRow[], extra: Partial<FollowupDeps> = {}) {
    const state = { notices: [] as string[], notified: [] as string[], emailed: [] as string[], sent: [] as string[] }
    const value: FollowupDeps = {
      mailConfig: () => ({ config: { apiKey: 'k', from: 'f', replyTo: 'r' }, missing: [] }),
      loadDue: async () => rows,
      loadPeople: async () => people(person(), person({ id: 'beto', email: 'beto@example.com', display_name: 'Beto' })),
      loadEmailedRecently: async () => new Set(),
      remainingBudget: async () => 50,
      notice: async (p, message) => { state.notices.push(`${p.id}: ${message}`) },
      markNotified: async (ids) => { state.notified.push(...ids) },
      markEmailed: async (ids) => { state.emailed.push(...ids) },
      sendEmail: async (p) => { state.sent.push(p.id); return { ok: true } },
      now: () => now,
      ...extra,
    }
    return { value, state }
  }

  it('notices and emails who is due, marks them so it never repeats, and does nothing for the rest', async () => {
    const { value, state } = deps([row({ id: '1' }), row({ id: '2', user_id: 'beto' }), row({ id: '3', applied_at: ago(1), user_id: 'ana', vacancy_id: 'v-3' })])
    const outcome = await runApplicationFollowups(value)
    expect(outcome).toEqual({ status: 'done', planned: 2, notified: 2, emailed: 2, waiting: 0 })
    expect(state.notified.sort()).toEqual(['1', '2'])
    expect(state.emailed.sort()).toEqual(['1', '2'])
    expect(state.sent.sort()).toEqual(['ana', 'beto'])
  })

  it('still notices in the app when there is no mail key, and does not spend any email quota for notices', async () => {
    const budget = vi.fn(async () => 50)
    const { value, state } = deps([row({ id: '1' })], { mailConfig: () => ({ config: null, missing: ['RESEND_API_KEY'] }), remainingBudget: budget })
    const outcome = await runApplicationFollowups(value)
    expect(outcome).toMatchObject({ notified: 1, emailed: 0 })
    expect(state.sent).toEqual([])
    expect(state.notices).toHaveLength(1)
  })

  it('leaves the emails for the next run when the daily quota is gone, but still notices in the app', async () => {
    const { value, state } = deps([row({ id: '1' }), row({ id: '2', user_id: 'beto' })], { remainingBudget: async () => 0 })
    expect(await runApplicationFollowups(value)).toEqual({ status: 'done', planned: 2, notified: 2, emailed: 0, waiting: 2 })
    expect(state.emailed).toEqual([])
  })

  it('a quota error from the mail provider stops the emails of this run without marking the person as emailed', async () => {
    const { value, state } = deps([row({ id: '1' }), row({ id: '2', user_id: 'beto' })], { sendEmail: async () => ({ ok: false, quota: true }) })
    const outcome = await runApplicationFollowups(value)
    expect(outcome).toMatchObject({ notified: 2, emailed: 0, waiting: 2 })
    expect(state.emailed).toEqual([])
  })

  it('only the applied ones are marked as emailed (the unanswered reminder is not an email)', async () => {
    const { value, state } = deps([row({ id: 'si' }), row({ id: 'no', status: 'clicked', applied_at: null, clicked_at: ago(3), vacancy_id: 'v-no' })])
    await runApplicationFollowups(value)
    expect(state.notified.sort()).toEqual(['no', 'si'])
    expect(state.emailed).toEqual(['si'])
  })

  it('says it skipped, instead of failing, when the table does not exist yet', async () => {
    const { value } = deps([], { loadDue: async () => { throw new Error('relation "vacancy_applications" does not exist') } })
    expect(await runApplicationFollowups(value)).toEqual({ status: 'skipped', reason: 'falta aplicar vacancy-applications-migration.sql' })
  })

  it('does nothing when nobody is due', async () => {
    const { value, state } = deps([row({ id: '1', applied_at: ago(1) })])
    expect(await runApplicationFollowups(value)).toEqual({ status: 'done', planned: 0, notified: 0, emailed: 0, waiting: 0 })
    expect(state.notices).toEqual([])
  })
})

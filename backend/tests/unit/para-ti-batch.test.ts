import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import {
  ALERT_EMAILS_PER_RUN, ALERT_MAX_PER_DAY, ALERT_MAX_PER_WEEK, DIGEST_MIN_GAP_DAYS,
  planAlerts, planDigests, runAlertBatch, runDigestBatch,
  type MatchDeps, type MatchHistory, type MatchPerson,
} from '../../services/email/para-ti-batch'
import type { MatchableVacancy } from '../../services/email/para-ti'

const NOW = new Date('2026-11-03T16:00:00Z')
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600000).toISOString()

let n = 0
const person = (patch: Partial<MatchPerson> = {}): MatchPerson => ({
  id: `u${++n}`, email: `p${n}@example.com`, display_name: 'Ana Pérez', name: null, username: 'ana',
  role_category: 'backend', seniority: 'senior', skills: ['react', 'postgresql', 'azure', 'angular'], work_modality: 'Híbrido',
  email_opt_out: false, email_prefs: null, ...patch,
})
const vacancy = (patch: Partial<MatchableVacancy> = {}): MatchableVacancy => ({
  id: `v${++n}`, slug: `vacante-${n}`, title: `Vacante ${n}`, company: 'Acme', modalidad: 'Híbrido', seniority_level: 'senior',
  role_category: 'backend', skills: ['react', 'postgresql', 'azure', 'angular'], created_at: ago(3), ...patch,
})
const history = (patch: Partial<MatchHistory> = {}): MatchHistory => ({ alerted: new Map(), emails: [], ...patch })
const weak = (patch: Partial<MatchableVacancy> = {}) => vacancy({ role_category: 'ventas', seniority_level: 'junior', skills: ['sales'], modalidad: 'Presencial', ...patch })

describe('quién recibe una alerta de coincidencia fuerte', () => {
  it('solo con 80 % o más, y la mejor vacante nueva', () => {
    const strong = vacancy()
    const plans = planAlerts([person()], [weak(), strong], history(), NOW)
    expect(plans).toHaveLength(1)
    expect(plans[0].match.vacancy.id).toBe(strong.id)
    expect(plans[0].match.score).toBeGreaterThanOrEqual(80)
  })

  it('sin vacantes de 80 % o más, nadie recibe nada', () => {
    expect(planAlerts([person()], [weak()], history(), NOW)).toEqual([])
  })

  it('no repite una vacante que ya se le avisó', () => {
    const p = person()
    const v = vacancy()
    expect(planAlerts([p], [v], history({ alerted: new Map([[p.id, new Set([v.id])]]) }), NOW)).toEqual([])
  })

  it('no mira vacantes viejas', () => {
    expect(planAlerts([person()], [vacancy({ created_at: ago(24 * 10) })], history(), NOW)).toEqual([])
  })

  it('el aviso en la campana va siempre, pero el correo solo si lo quiere', () => {
    const [off] = planAlerts([person({ email_prefs: { alerts: false } })], [vacancy()], history(), NOW)
    expect(off.email).toBe(false)
    const [on] = planAlerts([person()], [vacancy()], history(), NOW)
    expect(on.email).toBe(true)
  })

  it(`tope: ${ALERT_MAX_PER_DAY} correo al día y ${ALERT_MAX_PER_WEEK} a la semana`, () => {
    const p = person()
    const sent = (hours: number) => ({ user_id: p.id, kind: 'alert' as const, created_at: ago(hours) })
    expect(planAlerts([p], [vacancy()], history({ emails: [sent(5)] }), NOW)[0].email).toBe(false)
    expect(planAlerts([p], [vacancy()], history({ emails: [sent(30), sent(60), sent(90)] }), NOW)[0].email).toBe(false)
    expect(planAlerts([p], [vacancy()], history({ emails: [sent(30), sent(60)] }), NOW)[0].email).toBe(true)
  })

  it('no manda correo a quien se dio de baja o no tiene correo válido', () => {
    expect(planAlerts([person({ email_opt_out: true })], [vacancy()], history(), NOW)[0].email).toBe(false)
    expect(planAlerts([person({ email: 'no-es-correo' })], [vacancy()], history(), NOW)[0].email).toBe(false)
  })
})

describe('quién recibe el resumen semanal', () => {
  it('con 60 % o más, hasta 5 vacantes, de la más compatible a la menos', () => {
    const many = Array.from({ length: 8 }, () => vacancy())
    const [plan] = planDigests([person()], [...many, weak()], history(), NOW)
    expect(plan.matches).toHaveLength(5)
    expect(plan.matches.every(match => match.score >= 60)).toBe(true)
  })

  it('si no hay nada que encaje, no se le manda (sin relleno)', () => {
    expect(planDigests([person()], [weak()], history(), NOW)).toEqual([])
  })

  it(`uno cada ${DIGEST_MIN_GAP_DAYS} días como mucho`, () => {
    const p = person()
    const sent = (days: number) => ({ user_id: p.id, kind: 'digest' as const, created_at: ago(days * 24) })
    expect(planDigests([p], [vacancy()], history({ emails: [sent(2)] }), NOW)).toEqual([])
    expect(planDigests([p], [vacancy()], history({ emails: [sent(7)] }), NOW)).toHaveLength(1)
  })

  it('no a quien lo apagó, se dio de baja o no completó el perfil', () => {
    expect(planDigests([person({ email_prefs: { digest: false } })], [vacancy()], history(), NOW)).toEqual([])
    expect(planDigests([person({ email_opt_out: true })], [vacancy()], history(), NOW)).toEqual([])
    expect(planDigests([person({ role_category: null })], [vacancy()], history(), NOW)).toEqual([])
  })
})

describe('las corridas', () => {
  const config = { apiKey: 'k', from: 'AvoTalent <notificaciones@notificaciones.avotalent.app>', replyTo: 'hola@avotalent.app' }

  const setup = (people: MatchPerson[], vacancies: MatchableVacancy[], over: Partial<MatchDeps> = {}) => {
    const log = { alerts: [] as string[], emails: [] as string[], recorded: [] as string[], marked: [] as string[] }
    const deps: MatchDeps = {
      mailConfig: () => ({ config, missing: [] }),
      loadPeople: async () => people,
      loadVacancies: async () => vacancies,
      loadHistory: async () => history(),
      remainingBudget: async () => 90,
      labels: async () => skills => skills.map(skill => skill.toUpperCase()),
      recordAlert: async person => { log.alerts.push(person.id); return true },
      markAlertEmailed: async person => { log.marked.push(person.id) },
      recordEmail: async (person, kind) => { log.recorded.push(`${kind}:${person.id}`) },
      sendEmail: async person => { log.emails.push(person.id); return { ok: true, id: 'r' } },
      now: () => NOW,
      ...over,
    }
    return { deps, log }
  }

  it('alertas: deja el aviso a todas y manda correo a quien le toca', async () => {
    const a = person()
    const b = person({ email_prefs: { alerts: false } })
    const { deps, log } = setup([a, b], [vacancy()])
    expect(await runAlertBatch(deps)).toMatchObject({ status: 'done', planned: 2, notified: 2, emailed: 1 })
    expect(log.alerts).toEqual([a.id, b.id])
    expect(log.emails).toEqual([a.id])
    expect(log.recorded).toEqual([`alert:${a.id}`])
  })

  it(`alertas: nunca más de ${ALERT_EMAILS_PER_RUN} correos por corrida, el resto queda en espera`, async () => {
    const people = Array.from({ length: ALERT_EMAILS_PER_RUN + 4 }, () => person())
    const { deps, log } = setup(people, [vacancy()])
    expect(await runAlertBatch(deps)).toMatchObject({ emailed: ALERT_EMAILS_PER_RUN, waiting: 4, notified: people.length })
    expect(log.emails).toHaveLength(ALERT_EMAILS_PER_RUN)
  })

  it('alertas: sin cupo de correos sigue avisando en la campana, sin gastar correos', async () => {
    const { deps, log } = setup([person()], [vacancy()], { remainingBudget: async () => 0 })
    expect(await runAlertBatch(deps)).toMatchObject({ notified: 1, emailed: 0, waiting: 1 })
    expect(log.emails).toEqual([])
  })

  it('alertas: sin clave de Resend también avisa en la campana', async () => {
    const { deps, log } = setup([person()], [vacancy()], { mailConfig: () => ({ config: null, missing: ['RESEND_API_KEY'] }) })
    expect(await runAlertBatch(deps)).toMatchObject({ notified: 1, emailed: 0 })
    expect(log.alerts).toHaveLength(1)
  })

  it('alertas: si Resend dice que no hay cupo, se detienen los correos', async () => {
    const { deps, log } = setup([person(), person(), person()], [vacancy()], { sendEmail: async () => ({ ok: false, quota: true }) })
    const outcome = await runAlertBatch(deps)
    expect(outcome).toMatchObject({ emailed: 0 })
    expect(log.recorded).toEqual([])
  })

  it('sin las tablas nuevas (migración pendiente) no corre, para no repetir avisos', async () => {
    const { deps, log } = setup([person()], [vacancy()], { loadHistory: async () => null })
    expect(await runAlertBatch(deps)).toEqual({ status: 'skipped', reason: 'falta aplicar notifications-migration.sql' })
    expect(await runDigestBatch(deps)).toEqual({ status: 'skipped', reason: 'falta aplicar notifications-migration.sql' })
    expect(log.alerts).toEqual([])
  })

  it('resumen: manda a quien le toca y lo anota', async () => {
    const a = person()
    const { deps, log } = setup([a], [vacancy(), vacancy()])
    expect(await runDigestBatch(deps)).toMatchObject({ status: 'done', emailed: 1 })
    expect(log.recorded).toEqual([`digest:${a.id}`])
  })

  it('resumen: respeta el cupo y la clave de Resend', async () => {
    const people = Array.from({ length: 10 }, () => person())
    const limited = setup(people, [vacancy()], { remainingBudget: async () => 3 })
    await runDigestBatch(limited.deps)
    expect(limited.log.emails).toHaveLength(3)

    const none = setup(people, [vacancy()], { remainingBudget: async () => 0 })
    expect((await runDigestBatch(none.deps)).status).toBe('skipped')
    const nokey = setup(people, [vacancy()], { mailConfig: () => ({ config: null, missing: ['RESEND_API_KEY'] }) })
    expect(await runDigestBatch(nokey.deps)).toEqual({ status: 'skipped', reason: 'falta RESEND_API_KEY' })
  })
})

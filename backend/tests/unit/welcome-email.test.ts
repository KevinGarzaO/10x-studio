import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import {
  FOUNDERS_KIND, WELCOME_CUTOFF, WELCOME_KIND, WELCOME_MAX_AGE_DAYS, WELCOME_MIN_AGE_MINUTES, WELCOME_RUN_LIMIT,
  buildWelcome, runWelcomeBatch, welcomeAudienceOf, type WelcomeDeps,
} from '../../services/email/welcome'
import type { AudienceUser } from '../../services/email/profile-reminder'

const minutes = (value: number) => value * 60000
const AFTER = new Date(WELCOME_CUTOFF.getTime() + 3 * 86400000)
const at = (offsetMs: number) => new Date(AFTER.getTime() - offsetMs).toISOString()

let n = 0
const person = (patch: Partial<AudienceUser> = {}): AudienceUser => ({
  id: `u${++n}`, email: `p${n}@example.com`, display_name: 'Ana Pérez', name: null, username: 'ana', provider: 'email',
  user_kind: 'user', is_test_account: false, is_scraper_profile: false, profile_completed: false, email_opt_out: false,
  created_at: at(minutes(30)), ...patch,
})
const before = (completed: boolean) => person({ created_at: new Date(WELCOME_CUTOFF.getTime() - 5 * 86400000).toISOString(), profile_completed: completed })

describe('quién recibe cada bienvenida', () => {
  it('quien se registra después del corte recibe la bienvenida con pasos, pasados 10 minutos', () => {
    expect(welcomeAudienceOf(person({ created_at: at(minutes(WELCOME_MIN_AGE_MINUTES + 1)) }), new Set(), AFTER)).toBe('new')
    expect(welcomeAudienceOf(person({ created_at: at(minutes(WELCOME_MIN_AGE_MINUTES - 3)) }), new Set(), AFTER)).toBeNull()
  })

  it('no manda una bienvenida tardía: pasados 7 días ya no', () => {
    expect(welcomeAudienceOf(person({ created_at: at((WELCOME_MAX_AGE_DAYS + 1) * 86400000) }), new Set(), new Date(AFTER.getTime() + 86400000))).toBeNull()
  })

  it('los que ya estaban antes del corte reciben "primeros miembros", solo si completaron el perfil', () => {
    expect(welcomeAudienceOf(before(true), new Set(), AFTER)).toBe('founders')
    expect(welcomeAudienceOf(before(false), new Set(), AFTER)).toBeNull()
  })

  it.each([
    ['cuenta de prueba', { is_test_account: true }],
    ['perfil del scraper', { is_scraper_profile: true }],
    ['equipo', { user_kind: 'superadmin' }],
    ['empresa', { user_kind: 'company' }],
    ['sin correo', { email: null }],
    ['correo mal escrito', { email: 'no-es-un-correo' }],
    ['dada de baja', { email_opt_out: true }],
  ] as const)('nunca: %s', (_label, patch) => {
    expect(welcomeAudienceOf(person(patch as Partial<AudienceUser>), new Set(), AFTER)).toBeNull()
  })

  it('una sola bienvenida por persona, de cualquiera de los dos tipos', () => {
    const user = person()
    expect(welcomeAudienceOf(user, new Set([user.id]), AFTER)).toBeNull()
  })
})

describe('el correo según la persona', () => {
  const vacancy = { id: 'v', slug: 's', title: 'Dev', meta: 'Acme', url: 'https://avotalent.app/vacantes/s?utm_source=email', label: 'popular' as const, score: 2 }

  it('quien aún no completa el perfil: el botón lleva al onboarding', () => {
    const email = buildWelcome('new', person({ profile_completed: false }), vacancy, 462)
    expect(email.subject).toBe('Bienvenido a AvoTalent, Ana')
    expect(email.html).toContain('/onboarding?')
    expect(email.html).toContain('Completar mi perfil ahora')
  })

  it('quien ya lo completó: el botón lleva al feed', () => {
    const email = buildWelcome('new', person({ profile_completed: true }), vacancy, 462)
    expect(email.html).toContain('Ver mis vacantes')
    expect(email.html).not.toContain('/onboarding?')
  })

  it('primeros miembros: agradece y pide opinión, con los enlaces marcados', () => {
    const email = buildWelcome('founders', person({ profile_completed: true }), vacancy, 462)
    expect(email.subject).toBe('Ana, gracias por ser de los primeros en AvoTalent')
    expect(email.html).toContain('qué te gustaría encontrar en AvoTalent')
    expect(email.html).toContain('utm_campaign=bienvenida-fundadores')
    expect(email.html).toContain('utm_medium=bienvenida')
  })
})

describe('la corrida de bienvenidas', () => {
  const config = { apiKey: 'k', from: 'AvoTalent <notificaciones@notificaciones.avotalent.app>', replyTo: 'hola@avotalent.app' }
  const vacancy = { id: 'v', slug: 's', title: 'Dev', meta: 'Acme', url: 'x', label: 'popular' as const, score: 1 }

  const setup = (candidates: { new: AudienceUser[]; founders: AudienceUser[] }, over: Partial<WelcomeDeps> = {}) => {
    const delivered: { id: string; kind: string }[] = []
    const deps: WelcomeDeps = {
      mailConfig: () => ({ config, missing: [] }),
      loadCandidates: async () => ({ ...candidates, ready: true }),
      remainingBudget: async () => 90,
      loadVacancy: async () => ({ vacancy, openVacancies: 10 }),
      deliver: async (user, kind) => { delivered.push({ id: user.id, kind }); return { ok: true } },
      ...over,
    }
    return { deps, delivered }
  }

  it('manda cada grupo con su tipo de correo', async () => {
    const a = person()
    const b = person()
    const first = setup({ new: [a], founders: [b] })
    await runWelcomeBatch('new', first.deps)
    await runWelcomeBatch('founders', first.deps)
    expect(first.delivered).toEqual([{ id: a.id, kind: WELCOME_KIND }, { id: b.id, kind: FOUNDERS_KIND }])
  })

  it(`las nuevas salen de ${WELCOME_RUN_LIMIT} en ${WELCOME_RUN_LIMIT} por corrida`, async () => {
    const many = Array.from({ length: WELCOME_RUN_LIMIT + 5 }, () => person())
    const { deps, delivered } = setup({ new: many, founders: [] })
    expect(await runWelcomeBatch('new', deps)).toMatchObject({ status: 'done', sent: WELCOME_RUN_LIMIT, waiting: 5 })
    expect(delivered).toHaveLength(WELCOME_RUN_LIMIT)
  })

  it('nunca pasa del cupo que queda en el día', async () => {
    const many = Array.from({ length: 40 }, () => person({ profile_completed: true }))
    const { deps, delivered } = setup({ new: [], founders: many }, { remainingBudget: async () => 6 })
    await runWelcomeBatch('founders', deps)
    expect(delivered).toHaveLength(6)
  })

  it('sin nadie, sin clave de Resend, sin migración o sin cupo, no envía ni busca vacantes', async () => {
    const boom = async () => { throw new Error('no debía llamarse') }
    const a = setup({ new: [], founders: [] }, { loadVacancy: boom })
    expect(await runWelcomeBatch('new', a.deps)).toEqual({ status: 'done', sent: 0, failed: 0, waiting: 0 })
    const b = setup({ new: [person()], founders: [] }, { mailConfig: () => ({ config: null, missing: ['RESEND_API_KEY'] }), loadVacancy: boom })
    expect(await runWelcomeBatch('new', b.deps)).toEqual({ status: 'skipped', reason: 'falta RESEND_API_KEY' })
    const c = setup({ new: [person()], founders: [] }, { loadCandidates: async () => ({ new: [person()], founders: [], ready: false }), loadVacancy: boom })
    expect((await runWelcomeBatch('new', c.deps)).status).toBe('skipped')
    const d = setup({ new: [person()], founders: [] }, { remainingBudget: async () => 0, loadVacancy: boom })
    expect((await runWelcomeBatch('new', d.deps)).status).toBe('skipped')
    expect([a, b, c, d].every(item => item.delivered.length === 0)).toBe(true)
  })

  it('un fallo al enviar a una persona no detiene a las demás', async () => {
    const people = [person(), person(), person()]
    let calls = 0
    const { deps } = setup({ new: people, founders: [] }, { deliver: async () => ({ ok: ++calls !== 2 }) })
    expect(await runWelcomeBatch('new', deps)).toMatchObject({ sent: 2, failed: 1 })
  })
})

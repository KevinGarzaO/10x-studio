import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: {} }))

import { monterreyDayStart } from '../../services/email/budget'
import { parseCsv } from '../../services/email/csv'
import {
  FULL_DAILY, GAP_DAYS, WARMUP, activeDaysBefore, buildInvitation, dailyCap, firstNameOf, normalizeContacts, pickDue, runInvitationBatch,
  type InviteDeps, type Invitation, type InviteSend,
} from '../../services/email/invitations'

const NOW = new Date('2026-10-30T17:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString()

let n = 0
const inv = (patch: Partial<Invitation> = {}): Invitation => ({ id: `i${++n}`, code: `code${n}`, email: `p${n}@example.com`, first_name: 'Ana', source: 'lista', position: n, suppressed: false, user_id: null, ...patch })
const send = (invitation: Invitation, step: 1 | 2, patch: Partial<InviteSend> = {}): InviteSend => ({ invitation_id: invitation.id, step, status: 'sent', resend_id: 'r', last_event: 'delivered', created_at: daysAgo(GAP_DAYS + 1), ...patch })

describe('la lista', () => {
  it('lee CSV con comillas, comas y saltos de línea dentro de un campo, y BOM', () => {
    const rows = parseCsv('﻿Email,Name\r\na@x.com,"Pérez, Ana"\r\nb@x.com,"Línea\ndos"\r\n')
    expect(rows).toEqual([{ Email: 'a@x.com', Name: 'Pérez, Ana' }, { Email: 'b@x.com', Name: 'Línea\ndos' }])
  })

  it('toma el primer nombre con mayúscula inicial; sin nombre usable, nada', () => {
    expect(firstNameOf('ANA MARÍA PÉREZ')).toBe('Ana')
    expect(firstNameOf('  jack christopher ')).toBe('Jack')
    expect(firstNameOf('')).toBeNull()
    expect(firstNameOf('x')).toBeNull()
    expect(firstNameOf('user123')).toBeNull()
  })

  it('deja correos en minúsculas, sin repetidos ni inválidos, y conserva el nombre que sí venga', () => {
    const contacts = normalizeContacts([
      { email: 'Ana@Example.com ', name: '', source: 'substack' },
      { email: 'ana@example.com', name: 'Ana Pérez', source: 'lista' },
      { email: 'no-es-correo', name: 'X', source: 'lista' },
      { email: 'beto@example.com', name: 'Beto', source: 'lista' },
    ])
    expect(contacts).toEqual([
      { email: 'ana@example.com', firstName: 'Ana', source: 'substack' },
      { email: 'beto@example.com', firstName: 'Beto', source: 'lista' },
    ])
  })
})

describe('el ritmo', () => {
  it('el día de Monterrey empieza a las 06:00 UTC', () => {
    expect(monterreyDayStart(new Date('2026-10-30T17:00:00Z')).toISOString()).toBe('2026-10-30T06:00:00.000Z')
    expect(monterreyDayStart(new Date('2026-10-30T03:00:00Z')).toISOString()).toBe('2026-10-29T06:00:00.000Z')
  })

  it('calentamiento: 20 el primer día, 40 el segundo y de ahí el tope normal', () => {
    expect([0, 1, 2, 3].map(dailyCap)).toEqual([WARMUP[0], WARMUP[1], FULL_DAILY, FULL_DAILY])
  })

  it('cuenta días distintos antes de hoy en que ya salieron correos', () => {
    const sends = [send(inv(), 1, { created_at: daysAgo(3) }), send(inv(), 1, { created_at: daysAgo(3) }), send(inv(), 1, { created_at: daysAgo(2) }), send(inv(), 1, { created_at: NOW.toISOString() }), send(inv(), 1, { created_at: daysAgo(1), status: 'failed' })]
    expect(activeDaysBefore(sends, NOW)).toBe(2)
  })
})

describe('a quién le toca', () => {
  it('la primera invitación, en el orden de la cola', () => {
    const second = inv({ position: 2 })
    const first = inv({ position: 1 })
    expect(pickDue([second, first], [], NOW).step1.map(item => item.id)).toEqual([first.id, second.id])
  })

  it(`la segunda y última, solo ${GAP_DAYS} días después de la primera`, () => {
    const early = inv()
    const ready = inv()
    const due = pickDue([early, ready], [send(early, 1, { created_at: daysAgo(GAP_DAYS - 1) }), send(ready, 1)], NOW)
    expect(due.step2.map(item => item.id)).toEqual([ready.id])
    expect(due.step1).toEqual([])
  })

  it('nunca a quien ya se registró, rebotó o marcó spam', () => {
    const registered = inv({ user_id: 'u1' })
    const bounced = inv({ suppressed: true })
    const ok = inv()
    const due = pickDue([registered, bounced, ok], [send(registered, 1), send(bounced, 1)], NOW)
    expect(due.step1.map(item => item.id)).toEqual([ok.id])
    expect(due.step2).toEqual([])
  })

  it('nunca repite un paso, tampoco si falló o sigue pendiente', () => {
    const failed = inv()
    const pending = inv()
    const done = inv()
    const due = pickDue([failed, pending, done], [send(failed, 1, { status: 'failed' }), send(pending, 1, { status: 'pending' }), send(done, 1), send(done, 2)], NOW)
    expect(due.step1).toEqual([])
    expect(due.step2).toEqual([])
  })
})

describe('el correo de cada persona', () => {
  const vacancies = ['a', 'b', 'c'].map(slug => ({ id: slug, slug, title: `Vacante ${slug}`, meta: 'Acme', url: 'x', label: 'popular' as const, score: 3 }))

  it('los enlaces llevan su código y marcan que vienen de una invitación', () => {
    const email = buildInvitation({ code: 'abc123', first_name: 'Ana' }, 1, vacancies, 443)
    const links = [...email.html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))
    const tracked = links.filter(link => link.includes('avotalent.app'))
    expect(tracked.length).toBeGreaterThanOrEqual(2)
    for (const link of tracked) {
      const url = new URL(link)
      expect(url.searchParams.get('utm_source')).toBe('email')
      expect(url.searchParams.get('utm_medium')).toBe('invitacion')
      expect(url.searchParams.get('utm_campaign')).toBe('invitacion-1')
      expect(url.searchParams.get('utm_content')).toBe('abc123')
    }
    expect(email.html).toContain('/signup?')
  })

  it('la primera lleva una vacante y la última tres', () => {
    expect((buildInvitation({ code: 'c', first_name: null }, 1, vacancies, 10).html.match(/\/vacantes\//g) ?? []).length).toBe(1)
    const last = buildInvitation({ code: 'c', first_name: null }, 2, vacancies, 10)
    expect((last.html.match(/\/vacantes\//g) ?? []).length).toBe(3)
    expect(last.html).toContain('invitacion-2')
    expect(last.html).toContain('no te escribiremos más')
  })
})

describe('la corrida diaria', () => {
  const config = { apiKey: 'k', from: 'AvoTalent <no-reply@avotalent.app>' }
  const vacancies = [{ id: 'v', slug: 's', title: 'Dev', meta: 'Acme', url: 'x', label: 'popular' as const, score: 1 }]

  const setup = (state: { invitations: Invitation[]; sends: InviteSend[] }, over: Partial<InviteDeps> = {}) => {
    const delivered: { id: string; step: number }[] = []
    const deps: InviteDeps = {
      mailConfig: () => ({ config, missing: [] }),
      prepare: async () => {},
      loadState: async () => state,
      remainingBudget: async () => 90,
      loadVacancies: async () => ({ vacancies, openVacancies: 10 }),
      deliver: async (invitation, step) => { delivered.push({ id: invitation.id, step }); return { ok: true } },
      now: () => NOW,
      ...over,
    }
    return { deps, delivered }
  }

  it('el primer día manda solo el tope de calentamiento', async () => {
    const people = Array.from({ length: 50 }, () => inv())
    const { deps, delivered } = setup({ invitations: people, sends: [] })
    const outcome = await runInvitationBatch(deps)
    expect(delivered).toHaveLength(WARMUP[0])
    expect(outcome).toMatchObject({ status: 'done', sent: WARMUP[0], step1: WARMUP[0], waiting: 30 })
  })

  it('las últimas invitaciones salen antes que las primeras', async () => {
    const old = inv({ position: 99 })
    const fresh = inv({ position: 1 })
    const warmed = [send(inv(), 1, { created_at: daysAgo(9) }), send(inv(), 1, { created_at: daysAgo(8) })]
    const { deps, delivered } = setup({ invitations: [fresh, old], sends: [...warmed, send(old, 1)] })
    await runInvitationBatch(deps)
    expect(delivered.map(item => `${item.step}:${item.id}`)).toEqual([`2:${old.id}`, `1:${fresh.id}`])
  })

  it('nunca pasa del cupo que queda en el día (se comparte con los demás correos)', async () => {
    const people = Array.from({ length: 30 }, () => inv())
    const { deps, delivered } = setup({ invitations: people, sends: [] }, { remainingBudget: async () => 7 })
    await runInvitationBatch(deps)
    expect(delivered).toHaveLength(7)
  })

  it('sin cupo, sin clave de Resend o sin vacantes se omite y no envía nada', async () => {
    const people = [inv()]
    const a = setup({ invitations: people, sends: [] }, { remainingBudget: async () => 0 })
    expect((await runInvitationBatch(a.deps)).status).toBe('skipped')
    const b = setup({ invitations: people, sends: [] }, { mailConfig: () => ({ config: null, missing: ['RESEND_API_KEY'] }) })
    expect(await runInvitationBatch(b.deps)).toEqual({ status: 'skipped', reason: 'falta RESEND_API_KEY' })
    const c = setup({ invitations: people, sends: [] }, { loadVacancies: async () => ({ vacancies: [], openVacancies: 0 }) })
    expect((await runInvitationBatch(c.deps)).status).toBe('skipped')
    expect([a, b, c].every(item => item.delivered.length === 0)).toBe(true)
  })

  it('--limit baja el tope de la corrida', async () => {
    const people = Array.from({ length: 10 }, () => inv())
    const { deps, delivered } = setup({ invitations: people, sends: [] })
    await runInvitationBatch(deps, { limit: 3 })
    expect(delivered).toHaveLength(3)
  })
})

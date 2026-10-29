import { describe, it, expect, vi, beforeEach } from 'vitest'

// Una base falsa que responde conteos por tabla (o falla si la tabla "no existe").
const state: { counts: Record<string, number | 'missing'>; inserted: { table: string; row: unknown }[] } = { counts: {}, inserted: [] }
vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ gte: () => Promise.resolve(state.counts[table] === 'missing' || state.counts[table] === undefined ? { count: null, error: { message: 'no existe' } } : { count: state.counts[table], error: null }) }),
      insert: (row: unknown) => { state.inserted.push({ table, row }); return Promise.resolve({ error: null }) },
    }),
  },
}))

import { RESERVE, TOTAL_DAILY_BUDGET, isQuotaError, remainingBudget, sendTracked, sentLast24h } from '../../services/email/budget'

beforeEach(() => { state.counts = {}; state.inserted = [] })

describe('el cupo de correos (24 horas corridas)', () => {
  it('lo que queda es 90 menos lo anotado en las últimas 24 horas', async () => {
    state.counts = { email_quota: 62 }
    expect(await sentLast24h()).toBe(62)
    expect(await remainingBudget()).toBe(TOTAL_DAILY_BUDGET - 62)
  })

  it('las tareas menos urgentes dejan una reserva libre', async () => {
    state.counts = { email_quota: 40 }
    expect(await remainingBudget(new Date(), RESERVE.invitations)).toBe(TOTAL_DAILY_BUDGET - RESERVE.invitations - 40)
    // Con 62 ya usados, la reserva de invitaciones (30) se come todo lo que queda: no se manda ninguna.
    state.counts = { email_quota: 62 }
    expect(await remainingBudget(new Date(), RESERVE.invitations)).toBe(0)
    // Pero lo urgente (sin reserva) sí tiene cupo.
    expect(await remainingBudget()).toBe(28)
  })

  it('nunca devuelve menos de cero', async () => {
    state.counts = { email_quota: 500 }
    expect(await remainingBudget()).toBe(0)
  })

  it('sin la tabla del cupo, estima con lo que sí está anotado y un margen por lo que no, para no pasarse', async () => {
    state.counts = { email_quota: 'missing', email_sends: 6, invitation_sends: 20 }
    expect(await sentLast24h()).toBe(6 + 20 + 40)
  })
})

describe('los errores de cupo de Resend', () => {
  it.each([
    [{ name: 'daily_quota_exceeded', message: 'x', statusCode: 429 }, true],
    [{ name: 'rate_limit_exceeded', message: 'x', statusCode: 429 }, true],
    [{ name: 'monthly_quota_exceeded', message: 'x', statusCode: 429 }, true],
    [{ name: 'validation_error', message: 'bad', statusCode: 422 }, false],
    [null, false],
  ])('%o -> %s', (error, expected) => {
    expect(isQuotaError(error as never)).toBe(expected)
  })
})

describe('sendTracked', () => {
  it('anota el envío en el cupo cuando Resend lo acepta', async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }) } }
    await sendTracked(resend as never, { from: 'a', to: 'b', subject: 's', html: 'h' }, 'prueba')
    expect(state.inserted).toEqual([{ table: 'email_quota', row: { kind: 'prueba' } }])
  })

  it('no anota nada si Resend lo rechaza', async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: null, error: { name: 'x', message: 'y' } }) } }
    await sendTracked(resend as never, { from: 'a', to: 'b', subject: 's', html: 'h' }, 'prueba')
    expect(state.inserted).toEqual([])
  })
})

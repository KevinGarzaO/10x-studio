import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/** Una base falsa en memoria con lo justo que usan las postulaciones (select/insert/update/delete con filtros). */
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]>, nextId: 1, failTable: '' }))

function builder(table: string) {
  const state: { op: 'select' | 'insert' | 'update' | 'delete'; filters: ((row: any) => boolean)[]; patch?: any; row?: any; order?: [string, boolean]; limit?: number } = { op: 'select', filters: [] }
  const rows = () => (db.tables[table] ??= [])
  const run = () => {
    if (db.failTable === table) return { data: null, error: { message: `relation "${table}" does not exist` } }
    const matching = rows().filter((row) => state.filters.every((test) => test(row)))
    if (state.op === 'insert') {
      const row = { id: `00000000-0000-4000-8000-${String(db.nextId++).padStart(12, '0')}`, ...state.row }
      const clash = rows().find((other) => other.user_id === row.user_id && other.vacancy_id === row.vacancy_id && table === 'vacancy_applications')
      if (clash) return { data: null, error: { message: 'duplicate key' } }
      rows().push(row)
      return { data: [row], error: null }
    }
    if (state.op === 'update') { matching.forEach((row) => Object.assign(row, state.patch)); return { data: matching, error: null } }
    if (state.op === 'delete') { db.tables[table] = rows().filter((row) => !matching.includes(row)); return { data: null, error: null } }
    let out = [...matching]
    if (state.order) out.sort((a, b) => (String(a[state.order![0]]) < String(b[state.order![0]]) ? 1 : -1) * (state.order![1] ? -1 : 1))
    if (state.limit) out = out.slice(0, state.limit)
    return { data: out, error: null }
  }
  const q: any = {}
  q.select = () => q
  q.insert = (row: any) => { state.op = 'insert'; state.row = row; return q }
  q.update = (patch: any) => { state.op = 'update'; state.patch = patch; return q }
  q.delete = () => { state.op = 'delete'; return q }
  q.eq = (key: string, value: unknown) => { state.filters.push((row) => row[key] === value); return q }
  q.in = (key: string, values: unknown[]) => { state.filters.push((row) => values.includes(row[key])); return q }
  q.gte = (key: string, value: string) => { state.filters.push((row) => String(row[key]) >= value); return q }
  q.order = (key: string, options: { ascending?: boolean } = {}) => { state.order = [key, options.ascending !== false]; return q }
  q.limit = (n: number) => { state.limit = n; return q }
  q.maybeSingle = () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }) }
  q.single = () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.data?.[0] ? null : r.error ?? { message: 'no rows' } }) }
  q.then = (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject)
  return q
}

vi.mock('../../services/supabase.service', () => ({ supabase: { from: (table: string) => builder(table) } }))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, res: any, next: any) => {
    const user = req.headers['x-user']
    if (!user) return res.status(401).json({ error: 'sin sesión' })
    req.userId = user
    next()
  },
}))

import { ANSWERS, answerPatch, followupKind, hostOf, isPromptDue, statusMap, statusPatch, LATER_HOURS } from '../../services/applications/applications'
import applicationsRoutes from '../../src/routes/community/applications.routes'

const ANA = '00000000-0000-4000-8000-00000000a0a0'
const BETO = '00000000-0000-4000-8000-00000000b0b0'
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const now = new Date('2026-11-02T18:00:00Z')
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

const app = () => { const server = express(); server.use(express.json()); server.use('/applications', applicationsRoutes); return server }
const as = (user: string) => ({ 'x-user': user })

beforeEach(() => {
  db.tables = {
    community_posts: [
      { id: V1, slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', source_url: 'https://boards.greenhouse.io/stripe/jobs/1', type: 'job', created_at: new Date().toISOString() },
      { id: V2, slug: 'una-discusion', title: 'Una discusión', company: null, source_url: null, type: 'discussion', created_at: new Date().toISOString() },
    ],
    vacancy_applications: [],
  }
  db.nextId = 1
  db.failTable = ''
})

describe('hostOf', () => {
  it('keeps only the site, without www, and nothing that is not a web address', () => {
    expect(hostOf('https://www.Boards.Greenhouse.io/stripe/jobs/1?gh_src=x')).toBe('boards.greenhouse.io')
    expect(hostOf('http://jobs.lever.co/acme')).toBe('jobs.lever.co')
    for (const bad of ['javascript:alert(1)', 'mailto:rh@x.com', 'no es una url', '', null, undefined]) expect(hostOf(bad as never)).toBeNull()
  })
})

describe('when to ask "¿Ya te postulaste?"', () => {
  it('only for attempts that left and were not answered, recent, and not snoozed', () => {
    expect(isPromptDue({ status: 'clicked', clicked_at: ago(1), remind_at: null }, now)).toBe(true)
    expect(isPromptDue({ status: 'applied', clicked_at: ago(1), remind_at: null }, now)).toBe(false)
    expect(isPromptDue({ status: 'not_yet', clicked_at: ago(1), remind_at: null }, now)).toBe(false)
    expect(isPromptDue({ status: 'clicked', clicked_at: ago(15 * 24), remind_at: null }, now)).toBe(false) // pasaron más de 14 días
    expect(isPromptDue({ status: 'clicked', clicked_at: ago(1), remind_at: ago(-5) }, now)).toBe(false) // «más tarde» vigente
    expect(isPromptDue({ status: 'clicked', clicked_at: ago(30), remind_at: ago(2) }, now)).toBe(true) // ya pasó el «más tarde»
    // «Todavía no» no deja a la persona sola: se le vuelve a preguntar a las 48 horas (y en la app, con un aviso)
    expect(isPromptDue({ status: 'not_yet', clicked_at: ago(3 * 24), remind_at: null, answered_at: ago(24) }, now)).toBe(false)
    expect(isPromptDue({ status: 'not_yet', clicked_at: ago(4 * 24), remind_at: null, answered_at: ago(49) }, now)).toBe(true)
    expect(isPromptDue({ status: 'not_yet', clicked_at: ago(20 * 24), remind_at: null, answered_at: ago(49) }, now)).toBe(false)
    expect(followupKind({ status: 'not_yet', applied_at: null, clicked_at: ago(4 * 24), answered_at: ago(49), followup_notified_at: null }, now)).toBe('unanswered')
  })

  it('each answer changes the row the way the screen promises', () => {
    expect(answerPatch('applied', now)).toMatchObject({ status: 'applied', applied_at: now.toISOString(), remind_at: null })
    expect(answerPatch('not_yet', now)).toMatchObject({ status: 'not_yet', remind_at: null })
    const later = answerPatch('later', now)
    expect(later.status).toBeUndefined() // sigue sin contestar
    expect(Date.parse(later.remind_at as string) - now.getTime()).toBe(LATER_HOURS * 3_600_000)
  })

  it('interview, offer and "no avanzó" imply the person already applied; it keeps the first applied date', () => {
    expect(statusPatch('interview', { applied_at: null }, now)).toMatchObject({ status: 'interview', applied_at: now.toISOString() })
    expect(statusPatch('offer', { applied_at: ago(100) }, now).applied_at).toBeUndefined()
    expect(statusPatch('not_yet', { applied_at: null }, now).applied_at).toBeUndefined()
  })
})

describe('follow-up rules', () => {
  const base = { followup_notified_at: null, applied_at: null, clicked_at: ago(1) }
  it('asks how it went 5 days after applying, once', () => {
    expect(followupKind({ ...base, status: 'applied', applied_at: ago(4 * 24) }, now)).toBeNull()
    expect(followupKind({ ...base, status: 'applied', applied_at: ago(5 * 24) }, now)).toBe('applied')
    expect(followupKind({ ...base, status: 'applied', applied_at: ago(9 * 24), followup_notified_at: ago(1) }, now)).toBeNull()
    expect(followupKind({ ...base, status: 'interview', applied_at: ago(9 * 24) }, now)).toBeNull() // ya avanzó: no se le pregunta lo mismo
  })
  it('reminds once, in the app, to whoever left and never answered', () => {
    expect(followupKind({ ...base, status: 'clicked', clicked_at: ago(24) }, now)).toBeNull()
    expect(followupKind({ ...base, status: 'clicked', clicked_at: ago(3 * 24) }, now)).toBe('unanswered')
    expect(followupKind({ ...base, status: 'clicked', clicked_at: ago(20 * 24) }, now)).toBeNull() // demasiado viejo
  })
})

describe('POST /applications (left to apply)', () => {
  it('saves the attempt with the site it went to, and a second click does not duplicate it', async () => {
    const first = await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 }).expect(201)
    expect(first.body.application).toMatchObject({ vacancyId: V1, title: 'Backend Engineer', company: 'Stripe', host: 'boards.greenhouse.io', status: 'clicked' })
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 }).expect(201)
    expect(db.tables.vacancy_applications).toHaveLength(1)
  })

  it('does not overwrite what the person already answered', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const id = db.tables.vacancy_applications[0].id
    await request(app()).post(`/applications/${id}/answer`).set(as(ANA)).send({ answer: 'applied' }).expect(200)
    const again = await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 }).expect(201)
    expect(again.body.application.status).toBe('applied')
  })

  it('a "todavía no" goes back to "left" when they leave again', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const id = db.tables.vacancy_applications[0].id
    await request(app()).post(`/applications/${id}/answer`).set(as(ANA)).send({ answer: 'not_yet' })
    const again = await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    expect(again.body.application.status).toBe('clicked')
  })

  it('needs a session, a valid id, and a vacancy (not a discussion)', async () => {
    await request(app()).post('/applications').send({ vacancyId: V1 }).expect(401)
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: 'abc' }).expect(400)
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V2 }).expect(404)
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: '33333333-3333-4333-8333-333333333333' }).expect(404)
  })
})

describe('the question when they come back', () => {
  it('GET /pending gives the attempt to ask about, and nothing once answered or snoozed', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const pending = await request(app()).get('/applications/pending').set(as(ANA)).expect(200)
    expect(pending.body.application).toMatchObject({ title: 'Backend Engineer', company: 'Stripe' })

    const id = pending.body.application.id
    await request(app()).post(`/applications/${id}/answer`).set(as(ANA)).send({ answer: 'later' }).expect(200)
    expect((await request(app()).get('/applications/pending').set(as(ANA))).body.application).toBeNull()

    db.tables.vacancy_applications[0].remind_at = ago(1) // ya pasó el «más tarde»
    expect((await request(app()).get('/applications/pending').set(as(ANA))).body.application).not.toBeNull()

    await request(app()).post(`/applications/${id}/answer`).set(as(ANA)).send({ answer: 'applied' }).expect(200)
    expect((await request(app()).get('/applications/pending').set(as(ANA))).body.application).toBeNull()
  })

  it('refuses an answer that is not one of the three', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const id = db.tables.vacancy_applications[0].id
    expect(ANSWERS).toEqual(['applied', 'not_yet', 'later'])
    await request(app()).post(`/applications/${id}/answer`).set(as(ANA)).send({ answer: 'hired' }).expect(400)
  })
})

describe('Mis postulaciones', () => {
  it('lists mine, newest first, saying if the vacancy is already closed', async () => {
    db.tables.vacancy_applications.push(
      { id: 'a1', user_id: ANA, vacancy_id: V1, vacancy_slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', apply_host: 'boards.greenhouse.io', status: 'applied', clicked_at: ago(50), applied_at: ago(48), updated_at: ago(48) },
      { id: 'a2', user_id: ANA, vacancy_id: '44444444-4444-4444-8444-444444444444', vacancy_slug: 'vieja', title: 'Vacante borrada', company: 'Acme', apply_host: null, status: 'clicked', clicked_at: ago(10), applied_at: null, updated_at: ago(10) },
      { id: 'a3', user_id: BETO, vacancy_id: V1, vacancy_slug: 'backend-1', title: 'Backend Engineer', company: 'Stripe', apply_host: null, status: 'applied', clicked_at: ago(5), applied_at: ago(5), updated_at: ago(5) },
    )
    const res = await request(app()).get('/applications').set(as(ANA)).expect(200)
    expect(res.body.applications.map((item: any) => item.id)).toEqual(['a2', 'a1']) // la más reciente primero, y nada de Beto
    expect(res.body.applications.find((item: any) => item.id === 'a2').closed).toBe(true) // la vacante ya no existe
    expect(res.body.applications.find((item: any) => item.id === 'a1').closed).toBe(false)
  })

  it('lets the person set a status, and only their own', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const id = db.tables.vacancy_applications[0].id
    const ok = await request(app()).patch(`/applications/${id}`).set(as(ANA)).send({ status: 'interview' }).expect(200)
    expect(ok.body.application.status).toBe('interview')
    expect(db.tables.vacancy_applications[0].applied_at).toBeTruthy()

    await request(app()).patch(`/applications/${id}`).set(as(BETO)).send({ status: 'offer' }).expect(404) // de otra persona
    await request(app()).patch(`/applications/${id}`).set(as(ANA)).send({ status: 'clicked' }).expect(400) // «salió» es del sistema
    await request(app()).patch(`/applications/${id}`).set(as(ANA)).send({ status: 'hired' }).expect(400)
    await request(app()).post(`/applications/${id}/answer`).set(as(BETO)).send({ answer: 'applied' }).expect(404)
  })

  it('removes one from the list, only if it is yours', async () => {
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 })
    const id = db.tables.vacancy_applications[0].id
    await request(app()).delete(`/applications/${id}`).set(as(BETO)).expect(404)
    expect(db.tables.vacancy_applications).toHaveLength(1)
    await request(app()).delete(`/applications/${id}`).set(as(ANA)).expect(204)
    expect(db.tables.vacancy_applications).toHaveLength(0)
  })
})

describe('without the migration', () => {
  it('the routes say "not ready" (503) instead of breaking, and the feed marks nothing instead of failing', async () => {
    db.failTable = 'vacancy_applications'
    await request(app()).get('/applications').set(as(ANA)).expect(503)
    await request(app()).post('/applications').set(as(ANA)).send({ vacancyId: V1 }).expect(503)
    expect((await statusMap(ANA, [V1])).size).toBe(0)
  })

  it('statusMap gives the status per vacancy for the feed marks, and nothing for a visitor', async () => {
    db.tables.vacancy_applications.push({ id: 'a1', user_id: ANA, vacancy_id: V1, status: 'applied' }, { id: 'a2', user_id: BETO, vacancy_id: V2, status: 'offer' })
    const map = await statusMap(ANA, [V1, V2])
    expect(map.get(V1)).toBe('applied')
    expect(map.has(V2)).toBe(false) // la de Beto no
    expect((await statusMap(null, [V1])).size).toBe(0)
  })
})

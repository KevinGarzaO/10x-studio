import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Una base falsa mínima: cada tabla es una lista y las consultas se aplican en memoria.
type Row = Record<string, unknown>
const db: { tables: Record<string, Row[]>; updates: { table: string; patch: Row; filters: [string, unknown][] }[]; inserts: { table: string; row: Row }[] } = { tables: {}, updates: [], inserts: [] }

function builder(table: string) {
  const filters: [string, unknown][] = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let patch: Row = {}
  let head = false
  let max = Infinity
  const rows = () => (db.tables[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value))
  const result = () => {
    if (op === 'update') { db.updates.push({ table, patch, filters: [...filters] }); rows().forEach(row => Object.assign(row, patch)); return { error: null } }
    const found = rows().slice(0, max)
    return head ? { count: found.length, error: null } : { data: found, count: found.length, error: null }
  }
  const q: Record<string, unknown> = {
    select: (_cols?: string, options?: { head?: boolean }) => { head = !!options?.head; return q },
    update: (value: Row) => { op = 'update'; patch = value; return q },
    insert: (row: Row) => { op = 'insert'; db.inserts.push({ table, row }); return Promise.resolve({ error: null }) },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return q },
    gte: () => q,
    order: () => q,
    limit: (value: number) => { max = value; return q },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return q
}

vi.mock('../../services/supabase.service', () => ({ supabase: { from: (table: string) => builder(table) } }))
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: { headers: Record<string, string>; userId?: string }, _res: unknown, next: () => void) => { req.userId = req.headers['x-user'] ?? 'u1'; next() },
}))

import notificationsRoutes, { withDefaults } from '../../src/routes/community/notifications.routes'
import { commentMessage, notifyComment } from '../../services/notifications/notify'

const app = () => {
  const server = express()
  server.use(express.json())
  server.use('/notifications', notificationsRoutes)
  return server
}

beforeEach(() => {
  db.updates = []
  db.inserts = []
  db.tables = {
    community_notifications: [
      { id: 'n1', user_id: 'u1', type: 'comment', message: 'Ana comentó', link: '/post/1', read: false, created_at: '2026-11-03T10:00:00Z' },
      { id: 'n2', user_id: 'u1', type: 'match', message: '87 %', link: '/vacantes/x', read: true, created_at: '2026-11-02T10:00:00Z' },
      { id: 'n3', user_id: 'u2', type: 'comment', message: 'de otra persona', link: '/post/2', read: false, created_at: '2026-11-03T09:00:00Z' },
    ],
    users: [{ id: 'u1', email_prefs: { digest: false } }],
  }
})

describe('la campana', () => {
  it('lista solo los avisos de la persona y cuenta los no leídos', async () => {
    const res = await request(app()).get('/notifications').expect(200)
    expect(res.body.notifications.map((item: { id: string }) => item.id)).toEqual(['n1', 'n2'])
    expect(res.body.unread).toBe(1)
  })

  it('da el número de no leídos para el puntito', async () => {
    expect((await request(app()).get('/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 })
  })

  it('marca todo como leído, solo lo suyo', async () => {
    await request(app()).post('/notifications/read-all').expect(200)
    expect(db.tables.community_notifications.find(item => item.id === 'n1')?.read).toBe(true)
    expect(db.tables.community_notifications.find(item => item.id === 'n3')?.read).toBe(false)
  })

  it('marca uno como leído, y nunca el de otra persona', async () => {
    await request(app()).post('/notifications/n3/read').expect(200)
    expect(db.tables.community_notifications.find(item => item.id === 'n3')?.read).toBe(false)
    await request(app()).post('/notifications/n1/read').expect(200)
    expect(db.tables.community_notifications.find(item => item.id === 'n1')?.read).toBe(true)
  })
})

describe('las preferencias de correo', () => {
  it('sin nada guardado todo está encendido', () => {
    expect(withDefaults(null)).toEqual({ digest: true, alerts: true })
    expect(withDefaults({ digest: false })).toEqual({ digest: false, alerts: true })
  })

  it('las lee con lo guardado', async () => {
    expect((await request(app()).get('/notifications/preferences').expect(200)).body.preferences).toEqual({ digest: false, alerts: true })
  })

  it('guarda solo claves conocidas y valores booleanos', async () => {
    const res = await request(app()).put('/notifications/preferences').send({ alerts: false, digest: 'no', hack: true }).expect(200)
    expect(res.body.preferences).toEqual({ digest: false, alerts: false })
    expect(db.updates.at(-1)?.patch).toEqual({ email_prefs: { digest: false, alerts: false } })
  })
})

describe('los avisos de comentarios', () => {
  it('el mensaje cambia cuando se juntan varios', () => {
    expect(commentMessage('Ana', 'Mi post', 1)).toBe('Ana comentó tu publicación «Mi post»')
    expect(commentMessage('Ana', 'Mi post', 3)).toBe('3 comentarios nuevos en tu publicación «Mi post»')
  })

  it('el primer comentario crea el aviso', async () => {
    db.tables.community_notifications = []
    await notifyComment({ authorId: 'u9', commenterId: 'u1', commenterName: 'Ana', postId: 'p1', postTitle: 'Mi post' })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].row).toMatchObject({ user_id: 'u9', type: 'comment', link: '/post/p1' })
  })

  it('los siguientes actualizan el mismo aviso sin leer en vez de llenar la lista', async () => {
    db.tables.community_notifications = [{ id: 'x', user_id: 'u9', type: 'comment', link: '/post/p1', read: false, meta: { count: 1 }, message: 'Ana comentó', created_at: new Date().toISOString() }]
    await notifyComment({ authorId: 'u9', commenterId: 'u2', commenterName: 'Beto', postId: 'p1', postTitle: 'Mi post' })
    expect(db.inserts).toHaveLength(0)
    expect(db.tables.community_notifications[0]).toMatchObject({ message: '2 comentarios nuevos en tu publicación «Mi post»', meta: { count: 2 } })
  })

  it('no avisa a quien comenta su propia publicación, ni cuando no hay autor', async () => {
    await notifyComment({ authorId: 'u1', commenterId: 'u1', commenterName: 'Ana', postId: 'p1', postTitle: 'x' })
    await notifyComment({ authorId: null, commenterId: 'u1', commenterName: 'Ana', postId: 'p1', postTitle: 'x' })
    expect(db.inserts).toHaveLength(0)
  })
})

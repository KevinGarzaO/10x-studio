import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { publicCache } from '../../middleware/public-cache.middleware'

/** Lo que se guarda unos minutos y, sobre todo, lo que NUNCA se guarda: nada que dependa de la cuenta. */
function app(options: Parameters<typeof publicCache>[1], status = 200) {
  const calls = { n: 0 }
  const server = express()
  server.use('/x', publicCache(60_000, { ...options, inTests: true }))
  server.get('/x/stats', (_req, res) => { calls.n += 1; res.status(status).json({ n: calls.n }) })
  server.get('/x/other', (_req, res) => { calls.n += 1; res.json({ n: calls.n }) })
  server.get('/x/', (req, res) => { calls.n += 1; res.json({ n: calls.n, who: req.headers.authorization ? 'cuenta' : 'visitante' }) })
  server.post('/x/stats', (_req, res) => { calls.n += 1; res.json({ n: calls.n }) })
  return { server, calls }
}

describe('publicCache', () => {
  it('serves the second identical request from memory, and keeps different addresses apart', async () => {
    const { server, calls } = app({ only: path => path === '/stats' })
    expect((await request(server).get('/x/stats?limit=6')).body).toEqual({ n: 1 })
    expect((await request(server).get('/x/stats?limit=6')).body).toEqual({ n: 1 }) // de memoria
    expect((await request(server).get('/x/stats?limit=7')).body).toEqual({ n: 2 }) // otra dirección: se calcula
    expect(calls.n).toBe(2)
  })

  it('only caches the routes it is told to, never the rest of what hangs from the same mount', async () => {
    const { server, calls } = app({ only: path => path === '/stats' })
    await request(server).get('/x/other'); await request(server).get('/x/other')
    expect(calls.n).toBe(2)
  })

  it('does not cache errors, nor writes', async () => {
    const failing = app({ only: () => true }, 500)
    await request(failing.server).get('/x/stats'); await request(failing.server).get('/x/stats')
    expect(failing.calls.n).toBe(2)
    const { server, calls } = app({ only: () => true })
    await request(server).post('/x/stats'); await request(server).post('/x/stats')
    expect(calls.n).toBe(2)
  })

  it('guestOnly: a visitor without a session is cached, but a person WITH a session never gets (or leaves) a stored answer', async () => {
    const { server } = app({ only: path => path === '/', guestOnly: true })
    expect((await request(server).get('/x/')).body).toEqual({ n: 1, who: 'visitante' })
    expect((await request(server).get('/x/')).body).toEqual({ n: 1, who: 'visitante' }) // el visitante: de memoria

    // con sesión: siempre se calcula, no ve lo guardado del visitante y no deja lo suyo guardado
    const first = await request(server).get('/x/').set('Authorization', 'Bearer abc')
    const second = await request(server).get('/x/').set('Authorization', 'Bearer abc')
    expect(first.body).toEqual({ n: 2, who: 'cuenta' })
    expect(second.body).toEqual({ n: 3, who: 'cuenta' })
    // y un visitante nuevo sigue viendo la respuesta de visitante, no la de la cuenta
    expect((await request(server).get('/x/')).body).toEqual({ n: 1, who: 'visitante' })
  })
})

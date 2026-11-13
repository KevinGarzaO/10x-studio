import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@avotalent/core/services/cron.service', () => ({ initCron: vi.fn() }))

import { startLeader, type LeaseAnswer, type LeaseApi } from '@avotalent/core/services/workers/leader'
import { cronsInApi, startScheduledJobs, workersEnabled } from '@avotalent/core/services/workers/scheduled-jobs'

/** Una base falsa con UN arrendamiento: lo que cada proceso recibe depende de quién lo tiene. */
function fakeDb() {
  let owner: string | null = null
  let down = false
  const lease = (): LeaseApi => ({
    async acquire(_name, holder): Promise<LeaseAnswer> {
      if (down) return 'unavailable'
      if (owner === null || owner === holder) { owner = holder; return 'yes' }
      return 'no'
    },
    async release(_name, holder) { if (owner === holder) owner = null },
  })
  return { lease, expire: () => { owner = null }, setDown: (value: boolean) => { down = value }, owner: () => owner }
}

const silent = () => undefined
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('startLeader', () => {
  it('the first process leads and starts its jobs once; renewing does not start them again', async () => {
    const db = fakeDb()
    const onLead = vi.fn()
    const leader = startLeader({ name: 'crons', holder: 'a', lease: db.lease(), onLead, onLost: vi.fn(), log: silent })
    await leader.tick()
    await leader.tick()
    expect(leader.isLeader()).toBe(true)
    expect(onLead).toHaveBeenCalledTimes(1)
    await leader.stop()
  })

  it('a second process does not lead while the first one is alive: jobs never run twice', async () => {
    const db = fakeDb()
    const a = vi.fn(), b = vi.fn()
    const la = startLeader({ name: 'crons', holder: 'a', lease: db.lease(), onLead: a, onLost: vi.fn(), log: silent })
    await la.tick()
    const lb = startLeader({ name: 'crons', holder: 'b', lease: db.lease(), onLead: b, onLost: vi.fn(), log: silent })
    await lb.tick()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    await la.stop(); await lb.stop()
  })

  it('when the leader stops (deploy), it releases and the other takes over on its next tick', async () => {
    const db = fakeDb()
    const b = vi.fn()
    const la = startLeader({ name: 'crons', holder: 'a', lease: db.lease(), onLead: vi.fn(), onLost: vi.fn(), log: silent })
    await la.tick()
    const lb = startLeader({ name: 'crons', holder: 'b', lease: db.lease(), onLead: b, onLost: vi.fn(), log: silent })
    await lb.tick()
    expect(b).not.toHaveBeenCalled()
    await la.stop()
    await lb.tick()
    expect(b).toHaveBeenCalledTimes(1)
    await lb.stop()
  })

  it('a leader that finds the lease in other hands stops its jobs', async () => {
    const db = fakeDb()
    const onLost = vi.fn()
    const l = startLeader({ name: 'crons', holder: 'a', lease: db.lease(), onLead: vi.fn(), onLost, log: silent })
    await l.tick()
    db.expire()
    await db.lease().acquire('crons', 'otro', 60)
    await l.tick()
    expect(l.isLeader()).toBe(false)
    expect(onLost).toHaveBeenCalledTimes(1)
    await l.stop()
  })

  it('a leader tolerates a couple of failed renewals, then stops by safety', async () => {
    const db = fakeDb()
    const onLost = vi.fn()
    const l = startLeader({ name: 'crons', holder: 'a', lease: db.lease(), onLead: vi.fn(), onLost, log: silent })
    await l.tick()
    db.setDown(true)
    await l.tick(); await l.tick()
    expect(l.isLeader()).toBe(true)
    await l.tick()
    expect(l.isLeader()).toBe(false)
    expect(onLost).toHaveBeenCalledTimes(1)
    await l.stop()
  })

  it('renews by itself on the timer', async () => {
    const db = fakeDb()
    const acquire = vi.spyOn(db.lease(), 'acquire')
    const lease = db.lease()
    const spy = vi.spyOn(lease, 'acquire')
    const l = startLeader({ name: 'crons', holder: 'a', lease, onLead: vi.fn(), onLost: vi.fn(), everySeconds: 15, log: silent })
    await vi.advanceTimersByTimeAsync(45_000)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(acquire).toBeDefined()
    await l.stop()
  })
})

describe('startScheduledJobs', () => {
  const env = (vars: Record<string, string>) => ({ APP_ENV: 'production', ...vars }) as unknown as NodeJS.ProcessEnv

  it('does nothing outside production', () => {
    const startJobs = vi.fn(() => vi.fn())
    expect(startScheduledJobs({ role: 'api', env: env({ APP_ENV: 'staging' }), lease: fakeDb().lease(), startJobs, log: silent })).toBeNull()
    expect(startJobs).not.toHaveBeenCalled()
  })

  it('the API can be switched off with RUN_CRONS_IN_API=off, and the worker only runs with WORKERS_ENABLED=on', () => {
    expect(cronsInApi(env({}))).toBe(true)
    expect(cronsInApi(env({ RUN_CRONS_IN_API: 'OFF' }))).toBe(false)
    expect(workersEnabled(env({}))).toBe(false)
    expect(workersEnabled(env({ WORKERS_ENABLED: 'on' }))).toBe(true)
    expect(startScheduledJobs({ role: 'api', env: env({ RUN_CRONS_IN_API: 'off' }), lease: fakeDb().lease(), startJobs: vi.fn(), log: silent })).toBeNull()
    expect(startScheduledJobs({ role: 'worker', env: env({}), lease: fakeDb().lease(), startJobs: vi.fn(), log: silent })).toBeNull()
  })

  it('API and worker together: only one runs the jobs, and the other takes over when the first goes away', async () => {
    const db = fakeDb()
    const stopApi = vi.fn(), stopWorker = vi.fn()
    const startApi = vi.fn(() => stopApi), startWorker = vi.fn(() => stopWorker)
    const api = startScheduledJobs({ role: 'api', env: env({}), lease: db.lease(), startJobs: startApi, log: silent })!
    await api.tick()
    const worker = startScheduledJobs({ role: 'worker', env: env({ WORKERS_ENABLED: 'on' }), lease: db.lease(), startJobs: startWorker, log: silent })!
    await worker.tick()
    expect(startApi).toHaveBeenCalledTimes(1)
    expect(startWorker).not.toHaveBeenCalled()
    await api.stop()
    expect(stopApi).toHaveBeenCalledTimes(1)
    await worker.tick()
    expect(startWorker).toHaveBeenCalledTimes(1)
    await worker.stop()
  })

  it('without the lease function: the API keeps running jobs as before (loudly), the worker runs nothing', async () => {
    const db = fakeDb()
    db.setDown(true)
    const startApi = vi.fn(() => vi.fn()), startWorker = vi.fn(() => vi.fn())
    const logs: string[] = []
    const api = startScheduledJobs({ role: 'api', env: env({}), lease: db.lease(), startJobs: startApi, log: (m) => logs.push(m) })!
    await api.tick()
    const worker = startScheduledJobs({ role: 'worker', env: env({ WORKERS_ENABLED: 'on' }), lease: db.lease(), startJobs: startWorker, log: silent })!
    await worker.tick()
    expect(startApi).toHaveBeenCalledTimes(1)
    expect(startWorker).not.toHaveBeenCalled()
    expect(logs.some((m) => m.includes('ALARMA'))).toBe(true)
    await api.stop(); await worker.stop()
  })

  it('an API that started without the lease stops its jobs once a worker holds it', async () => {
    const db = fakeDb()
    db.setDown(true)
    const stopApi = vi.fn()
    const api = startScheduledJobs({ role: 'api', env: env({}), lease: db.lease(), startJobs: vi.fn(() => stopApi), log: silent })!
    await api.tick()
    db.setDown(false)
    await db.lease().acquire('crons', 'worker', 60)
    await api.tick()
    expect(stopApi).toHaveBeenCalledTimes(1)
    await api.stop()
  })
})

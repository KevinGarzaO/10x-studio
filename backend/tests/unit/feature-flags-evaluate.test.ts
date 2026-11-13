import { describe, it, expect } from 'vitest'
import { ANONYMOUS, STAGES, bucketOf, evaluate, isStage, percentOf, type Stage, type Subject } from '../../services/flags/evaluate'

const person = (id: string, over: Partial<Subject> = {}): Subject => ({ userId: id, isTeam: false, groups: new Set(), ...over })
const team = person('team-1', { isTeam: true })
const beta = person('beta-1', { groups: new Set(['beta']) })
const flag = (stage: Stage, key = 'funcion_de_prueba') => ({ key, stage })
const see = (stage: Stage, subject: Subject, override: 'allow' | 'deny' | null = null) => evaluate(flag(stage), subject, override).enabled

describe('the ladder', () => {
  it('has the stages the owner asked for, in order', () => {
    expect([...STAGES]).toEqual(['off', 'equipo', 'beta', 'p1', 'p10', 'p25', 'p50', 'todos'])
    expect(['p1', 'p10', 'p25', 'p50', 'todos'].map((stage) => percentOf(stage as Stage))).toEqual([1, 10, 25, 50, 100])
    expect(isStage('p10')).toBe(true)
    expect(isStage('p99')).toBe(false)
    expect(isStage(null)).toBe(false)
  })

  it('off is the emergency button: nobody sees it, not even the team or someone put in by hand', () => {
    expect(see('off', team)).toBe(false)
    expect(see('off', beta)).toBe(false)
    expect(see('off', person('x'), 'allow')).toBe(false)
    expect(evaluate(flag('off'), team).reason).toBe('apagado')
  })

  it('equipo: only the team; beta: the team and the beta people; each step includes the previous ones', () => {
    const others = person('someone-else')
    expect([see('equipo', team), see('equipo', beta), see('equipo', others)]).toEqual([true, false, false])
    expect([see('beta', team), see('beta', beta), see('beta', others)]).toEqual([true, true, false])
    for (const stage of ['p1', 'p10', 'p25', 'p50', 'todos'] as Stage[]) {
      expect(see(stage, team)).toBe(true)
      expect(see(stage, beta)).toBe(true)
    }
  })

  it('a beta person only gets the beta benefit from the beta step on (not at equipo)', () => {
    expect(see('equipo', beta)).toBe(false)
    expect(evaluate(flag('beta'), beta).reason).toBe('beta')
  })

  it('todos: every person with or without session sees it', () => {
    expect(see('todos', person('anyone'))).toBe(true)
    expect(see('todos', ANONYMOUS)).toBe(true)
    expect(evaluate(flag('todos'), ANONYMOUS).reason).toBe('todos')
  })

  it('without a session, nothing below todos is visible (percentages need a person)', () => {
    for (const stage of ['equipo', 'beta', 'p1', 'p10', 'p25', 'p50'] as Stage[]) expect(see(stage, ANONYMOUS)).toBe(false)
  })
})

describe('overrides', () => {
  it('deny hides it even from the team and from todos; allow shows it to someone the step does not reach', () => {
    expect(see('todos', person('x'), 'deny')).toBe(false)
    expect(see('beta', team, 'deny')).toBe(false)
    expect(see('equipo', person('x'), 'allow')).toBe(true)
    expect(evaluate(flag('equipo'), person('x'), 'allow').reason).toBe('puesta_a_mano')
    expect(evaluate(flag('todos'), person('x'), 'deny').reason).toBe('excluida')
  })
})

describe('percentages are stable and nested', () => {
  const ids = Array.from({ length: 5000 }, (_, i) => `user-${i}`)

  it('the same person and flag always give the same number', () => {
    expect(bucketOf('f', 'u')).toBe(bucketOf('f', 'u'))
    expect(bucketOf('f', 'u')).toBeGreaterThanOrEqual(0)
    expect(bucketOf('f', 'u')).toBeLessThan(100)
  })

  it('each flag spreads people differently (being in the 1 % of one flag does not put you in the 1 % of all)', () => {
    const a = ids.filter((id) => bucketOf('flag_a', id) < 10)
    const b = new Set(ids.filter((id) => bucketOf('flag_b', id) < 10))
    const both = a.filter((id) => b.has(id)).length
    expect(both).toBeLessThan(a.length * 0.3)
  })

  it('the exposed share follows the step (within a reasonable margin) over a large group', () => {
    for (const stage of ['p1', 'p10', 'p25', 'p50'] as Stage[]) {
      const seen = ids.filter((id) => see(stage, person(id))).length / ids.length
      expect(Math.abs(seen - percentOf(stage) / 100)).toBeLessThan(0.02)
    }
  })

  it('raising the step only ADDS people: whoever is in at 1 % is still in at 10 %, 25 %, 50 % and todos', () => {
    const at = (stage: Stage) => new Set(ids.filter((id) => see(stage, person(id))))
    const [p1, p10, p25, p50] = [at('p1'), at('p10'), at('p25'), at('p50')]
    for (const id of p1) expect(p10.has(id)).toBe(true)
    for (const id of p10) expect(p25.has(id)).toBe(true)
    for (const id of p25) expect(p50.has(id)).toBe(true)
    expect(p1.size).toBeLessThan(p10.size)
    expect(p10.size).toBeLessThan(p25.size)
    expect(p25.size).toBeLessThan(p50.size)
  })

  it('lowering the step takes people out in the reverse order (the last ones in leave first), never at random', () => {
    const at = (stage: Stage) => new Set(ids.filter((id) => see(stage, person(id))))
    const p50 = at('p50')
    const p25 = at('p25')
    for (const id of p25) expect(p50.has(id)).toBe(true)
  })

  it('at the beta and equipo steps nobody enters by percentage', () => {
    expect(ids.filter((id) => see('beta', person(id))).length).toBe(0)
    expect(ids.filter((id) => see('equipo', person(id))).length).toBe(0)
  })
})

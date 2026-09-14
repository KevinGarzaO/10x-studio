import { describe, expect, it } from 'vitest'
import {
  levelFor,
  isBetterLevel,
  pickQuestions,
  isExpired,
  retryAvailableAt,
  expiresAtFrom,
  type SkillLevel,
} from '../../src/services/skill-exam.service'

describe('levelFor', () => {
  it('gives avanzado at 10/10', () => {
    expect(levelFor(10, 10)).toBe('avanzado')
  })

  it('gives avanzado at exactly 90%', () => {
    expect(levelFor(9, 10)).toBe('avanzado')
  })

  it('gives intermedio at exactly 70%', () => {
    expect(levelFor(7, 10)).toBe('intermedio')
  })

  it('gives intermedio just under the avanzado threshold', () => {
    expect(levelFor(8, 10)).toBe('intermedio')
  })

  it('gives basico just under the intermedio threshold', () => {
    expect(levelFor(6, 10)).toBe('basico')
  })

  // FR-020: no existe "terminé el examen y no validé nada".
  it('still gives basico at 0/10', () => {
    expect(levelFor(0, 10)).toBe('basico')
  })

  it('throws when questionCount is zero', () => {
    expect(() => levelFor(0, 0)).toThrow()
  })
})

describe('isBetterLevel', () => {
  const levels: SkillLevel[] = ['basico', 'intermedio', 'avanzado']

  it('treats any level as better than none', () => {
    for (const level of levels) {
      expect(isBetterLevel(level, null)).toBe(true)
    }
  })

  it.each([
    ['basico', 'basico', false],
    ['basico', 'intermedio', false],
    ['basico', 'avanzado', false],
    ['intermedio', 'basico', true],
    ['intermedio', 'intermedio', false],
    ['intermedio', 'avanzado', false],
    ['avanzado', 'basico', true],
    ['avanzado', 'intermedio', true],
    ['avanzado', 'avanzado', false],
  ] as [SkillLevel, SkillLevel, boolean][])(
    'candidate %s over current %s -> %s',
    (candidate, current, expected) => {
      expect(isBetterLevel(candidate, current)).toBe(expected)
    },
  )
})

describe('pickQuestions', () => {
  const noShuffle = (ids: string[]) => ids
  const bank20 = Array.from({ length: 20 }, (_, i) => `q${i}`)

  it('returns a set disjoint from the previous attempt when the bank allows it', () => {
    const previous = bank20.slice(0, 10)
    const picked = pickQuestions(bank20, previous, 10, noShuffle)

    expect(picked).toHaveLength(10)
    expect(picked.some((id) => previous.includes(id))).toBe(false)
  })

  it('reuses only what it must when the bank is too small to be disjoint', () => {
    const bank12 = Array.from({ length: 12 }, (_, i) => `q${i}`)
    const previous = bank12.slice(0, 10)
    const picked = pickQuestions(bank12, previous, 10, noShuffle)

    expect(picked).toHaveLength(10)
    // 2 frescas + 8 reutilizadas: el mínimo de repetición posible.
    expect(picked.filter((id) => previous.includes(id))).toHaveLength(8)
  })

  it('uses the whole bank on a first attempt', () => {
    const picked = pickQuestions(bank20, [], 10, noShuffle)
    expect(picked).toHaveLength(10)
    expect(new Set(picked).size).toBe(10)
  })

  it('never returns duplicates', () => {
    const picked = pickQuestions(bank20, bank20.slice(0, 15), 10, noShuffle)
    expect(new Set(picked).size).toBe(picked.length)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-09-13T12:00:00Z')

  it('is false before expires_at', () => {
    expect(isExpired({ status: 'in_progress', expires_at: '2026-09-13T18:00:00Z' }, now)).toBe(false)
  })

  it('is true after expires_at', () => {
    expect(isExpired({ status: 'in_progress', expires_at: '2026-09-13T06:00:00Z' }, now)).toBe(true)
  })

  it('is false for a completed attempt even past expires_at', () => {
    expect(
      isExpired({ status: 'completed', expires_at: '2026-09-13T06:00:00Z', finished_at: '2026-09-13T05:00:00Z' }, now),
    ).toBe(false)
  })
})

describe('retryAvailableAt', () => {
  const now = new Date('2026-09-13T12:00:00Z')

  it('counts 30 days from finished_at for a completed attempt', () => {
    const at = retryAvailableAt(
      { status: 'completed', expires_at: '2026-09-13T18:00:00Z', finished_at: '2026-09-13T10:00:00Z' },
      now,
    )
    expect(at?.toISOString()).toBe('2026-10-13T10:00:00.000Z')
  })

  it('counts 30 days from expires_at for an expired attempt', () => {
    const at = retryAvailableAt({ status: 'in_progress', expires_at: '2026-09-13T06:00:00Z' }, now)
    expect(at?.toISOString()).toBe('2026-10-13T06:00:00.000Z')
  })

  it('returns null while the attempt is still alive', () => {
    expect(retryAvailableAt({ status: 'in_progress', expires_at: '2026-09-13T18:00:00Z' }, now)).toBeNull()
  })
})

describe('expiresAtFrom', () => {
  it('adds 24 hours to the start', () => {
    expect(expiresAtFrom(new Date('2026-09-13T12:00:00Z')).toISOString()).toBe('2026-09-14T12:00:00.000Z')
  })
})

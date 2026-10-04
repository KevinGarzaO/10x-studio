import { describe, it, expect } from 'vitest'
import { pickDailyVacancies, type VacancyCandidate } from '../../services/scraper/daily-selection'

let counter = 0
const job = (company: string | null, role: string | null = null, level: string | null = null): VacancyCandidate => ({
  id: `v${++counter}`,
  company,
  role_category: role,
  seniority_level: level,
})

const many = (company: string, n: number, role: string | null = null, level: string | null = null) =>
  Array.from({ length: n }, () => job(company, role, level))

const companiesOf = (picked: VacancyCandidate[]) => picked.map(p => p.company)
const countBy = (items: (string | null)[]) =>
  items.reduce<Record<string, number>>((acc, c) => ((acc[c ?? '-'] = (acc[c ?? '-'] || 0) + 1), acc), {})

describe('pickDailyVacancies', () => {
  it('does not let one company fill the day', () => {
    // Antes: 300 de Stripe al frente del grupo llenaban los 20 cupos.
    const pool = [...many('Stripe', 300), ...many('Asana', 50), ...many('Databricks', 40), ...many('SpaceX', 40), ...many('Discord', 40)]

    const picked = pickDailyVacancies(pool, 20)

    expect(picked).toHaveLength(20)
    expect(Math.max(...Object.values(countBy(companiesOf(picked))))).toBeLessThanOrEqual(4)
    expect(new Set(companiesOf(picked)).size).toBe(5)
  })

  it('uses as many different companies as it can, at most two each', () => {
    const companies = Array.from({ length: 30 }, (_, i) => `Empresa ${String(i).padStart(2, '0')}`)
    const pool = companies.flatMap(c => many(c, 10))

    const picked = pickDailyVacancies(pool, 20)

    expect(picked).toHaveLength(20)
    expect(new Set(companiesOf(picked)).size).toBe(20)
  })

  it('treats the same company written two ways as one', () => {
    const pool = [...many('Twilio', 10), ...many('twilio', 10), ...many('Asana', 10)]

    const picked = pickDailyVacancies(pool, 6, { perCompanyCap: 2 })
    const counts = countBy(companiesOf(picked).map(c => c!.toLowerCase()))

    expect(counts.twilio).toBeLessThanOrEqual(3)
    expect(counts.asana).toBeGreaterThanOrEqual(2)
  })

  it('fills the whole day even when few companies are left, sharing evenly', () => {
    const pool = [...many('Stripe', 30), ...many('Asana', 30)]

    const picked = pickDailyVacancies(pool, 20)

    expect(picked).toHaveLength(20)
    expect(countBy(companiesOf(picked))).toEqual({ Stripe: 10, Asana: 10 })
  })

  it('keeps the incoming order within a company (newest first)', () => {
    const a1 = job('Stripe'), a2 = job('Stripe'), a3 = job('Stripe')
    const picked = pickDailyVacancies([a1, a2, a3], 3)

    expect(picked.map(p => p.id)).toEqual([a1.id, a2.id, a3.id])
  })

  it('starts with a different company every day', () => {
    const pool = [...many('Asana', 5), ...many('Brex', 5), ...many('Clara', 5)]

    const first = (rotation: number) => pickDailyVacancies(pool, 1, { rotation })[0].company
    expect([first(0), first(1), first(2), first(3)]).toEqual(['Asana', 'Brex', 'Clara', 'Asana'])
  })

  it('does not fill the day with a single role and level', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => job(`Empresa ${i}`, 'marketing', 'senior')),
      ...Array.from({ length: 10 }, (_, i) => job(`Otra ${i}`, 'backend', 'junior')),
    ]

    const picked = pickDailyVacancies(pool, 20, { perComboCap: 3 })
    const combos = countBy(picked.map(p => `${p.role_category}:${p.seniority_level}`))

    expect(combos['marketing:senior']).toBe(3)
    expect(combos['backend:junior']).toBe(3)
  })

  it('does not limit vacancies that are not classified yet', () => {
    const pool = Array.from({ length: 10 }, (_, i) => job(`Empresa ${i}`))

    expect(pickDailyVacancies(pool, 10, { perComboCap: 1 })).toHaveLength(10)
  })

  it('never returns more than the slots left, or anything when there are none', () => {
    const pool = many('Stripe', 10)

    expect(pickDailyVacancies(pool, 3)).toHaveLength(3)
    expect(pickDailyVacancies(pool, 0)).toEqual([])
    expect(pickDailyVacancies([], 20)).toEqual([])
  })

  it('does not pick the same vacancy twice', () => {
    const pool = [...many('Stripe', 8), ...many('Asana', 8)]
    const picked = pickDailyVacancies(pool, 16)

    expect(new Set(picked.map(p => p.id)).size).toBe(picked.length)
  })

  it('groups vacancies with no company under one name and falls back to their source', () => {
    const pool = [job(null), job(null), { ...job(null), source: 'Reddit' }]

    expect(pickDailyVacancies(pool, 3)).toHaveLength(3)
  })
})

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/supabase.service', () => ({ supabase: { from: () => ({}) } }))

import { buildSupply, LINKEDIN_PER_DAY, type OpenVacancy, type QueuedVacancy } from '../../services/analytics/supply'
import type { PersonProfile } from '../../services/vacancies/serves-someone'

const person = (roleCategory: string, skills: string[], seniority = 'senior'): PersonProfile => ({ roleCategory, seniority, skills, workModality: 'remote' })
const open = (id: string, role: string | null, skills: string[], extra: Partial<OpenVacancy> = {}): OpenVacancy => ({
  id, slug: `slug-${id}`, company: `Empresa ${id}`, role_category: role, seniority_level: 'senior', skills, work_modality: 'remote', ...extra,
})
const queued = (role: string | null, skills: string[]): QueuedVacancy => ({ role_category: role, seniority_level: 'senior', skills, work_modality: 'remote' })
const NOW = new Date('2026-11-06T18:00:00Z')

describe('buildSupply', () => {
  const people = [person('frontend', ['react', 'css']), person('frontend', ['react']), person('backend', ['nodejs'])]

  it('counts by role how many vacancies are open, in the queue, and how many serve at least one person', () => {
    const supply = buildSupply({
      people,
      open: [open('1', 'frontend', ['react']), open('2', 'frontend', ['vue']), open('3', 'backend', ['nodejs']), open('4', 'ventas', ['sales'])],
      usedInLinkedin: new Set(),
      queued: [queued('frontend', ['react']), queued('ventas', ['sales'])],
      nextBatchAt: new Date('2026-11-20T04:00:00Z'),
      now: NOW,
    })
    const frontend = supply.byRole.find((row) => row.role === 'frontend')!
    expect(frontend).toMatchObject({ candidates: 2, open: 2, openServing: 1, queued: 1, queuedServing: 1 }) // la de vue no comparte skills con nadie
    expect(supply.byRole.find((row) => row.role === 'ventas')).toMatchObject({ candidates: 0, open: 1, openServing: 0, queued: 1, queuedServing: 0 })
    expect(supply.totals).toMatchObject({ open: 4, openServing: 2, openServingPct: 50, queued: 2, queuedServing: 1, queuedServingPct: 50 })
    expect(supply.rolesWithoutPeople).toContain('Ventas y Desarrollo de Negocio')
    expect(supply.nextBatch.daysUntil).toBe(14)
  })

  it('LinkedIn reserve: only focus roles, with company and link, not already published, AND that serve someone; measured against the window to the next batch', () => {
    const vacancies = [
      open('1', 'frontend', ['react']),
      open('2', 'frontend', ['react']), // ya salió en LinkedIn
      open('3', 'backend', ['nodejs'], { company: '  ' }), // sin empresa: pickVacancy no la elige
      open('4', 'backend', ['nodejs'], { slug: null }), // sin enlace
      open('5', 'ventas', ['sales']), // puesto fuera del foco
      open('6', 'backend', ['nodejs']),
      open('7', 'frontend', ['vue']), // del foco, pero no le sirve a nadie (sus skills no las tiene ninguna persona)
    ]
    const supply = buildSupply({ people, open: vacancies, usedInLinkedin: new Set(['2']), queued: [queued('frontend', ['react']), queued('ventas', ['sales']), queued('frontend', ['vue'])], nextBatchAt: new Date('2026-11-16T04:00:00Z'), now: NOW })
    expect(supply.linkedin.reserve).toBe(2) // 1 y 6: la 7 no le sirve a nadie
    expect(supply.linkedin.perDay).toBe(LINKEDIN_PER_DAY)
    // la ventana son los días que faltan para el lote nuevo: 4 al día
    expect(supply.linkedin.windowDays).toBe(9)
    expect(supply.linkedin.needed).toBe(36)
    expect(supply.linkedin.coversWindow).toBe(false)
    expect(supply.linkedin.balanceAtRefresh).toBe(-34) // faltarían 34 publicaciones al llegar el lote nuevo
    expect(supply.linkedin.coveredDays).toBe(0.5) // 2 vacantes alcanzan para media jornada de 4
    // con la cola: suma las de la cola del foco que le sirven a alguien (la de frontend/react sí; la de vue y la de ventas no)
    expect(supply.linkedin.reserveWithQueue).toBe(3)
    expect(supply.linkedin.balanceWithQueue).toBe(-33)
  })

  it('when there is more useful stock than the window needs, it says how many would be left over when the new batch lands', () => {
    const many = Array.from({ length: 10 }, (_, i) => open(`m${i}`, 'frontend', ['react']))
    const supply = buildSupply({ people, open: many, usedInLinkedin: new Set(), queued: [], nextBatchAt: new Date('2026-11-09T04:00:00Z'), now: NOW })
    expect(supply.linkedin.windowDays).toBe(2)
    expect(supply.linkedin.needed).toBe(8)
    expect(supply.linkedin.coversWindow).toBe(true)
    expect(supply.linkedin.balanceAtRefresh).toBe(2) // sobrarían 2
    expect(supply.linkedin.coveredDays).toBe(2) // el tope es la ventana, no «cuántos días durarían todas»
  })

  it('without a known next batch it assumes a full cycle (15 days)', () => {
    const supply = buildSupply({ people, open: [], usedInLinkedin: new Set(), queued: [], nextBatchAt: null, now: NOW })
    expect(supply.linkedin.windowDays).toBe(15)
    expect(supply.nextBatch).toEqual({ at: null, daysUntil: null })
  })

  it('with no people to score, every vacancy counts as serving (the rule does not apply) and nothing breaks', () => {
    const supply = buildSupply({ people: [], open: [open('1', 'frontend', ['react'])], usedInLinkedin: new Set(), queued: [], nextBatchAt: null, now: NOW })
    expect(supply.totals).toMatchObject({ open: 1, openServing: 1, openServingPct: 100 })
    expect(supply.totals.queuedServingPct).toBeNull()
  })

  it('keeps a vacancy without role in its own line instead of losing it, and lists roles with people but no vacancies', () => {
    const supply = buildSupply({ people: [person('qa', ['cypress'])], open: [open('1', null, ['react'])], usedInLinkedin: new Set(), queued: [], nextBatchAt: null, now: NOW })
    expect(supply.byRole.find((row) => row.role === 'sin_puesto')?.open).toBe(1)
    expect(supply.rolesWithoutVacancies).toContain('QA y Pruebas')
  })
})

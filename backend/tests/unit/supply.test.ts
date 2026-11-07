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

  it('LinkedIn reserve: only roles in the focus, with company and link, that are not already published; 4 a day', () => {
    const vacancies = [
      open('1', 'frontend', ['react']),
      open('2', 'frontend', ['react']), // ya salió en LinkedIn
      open('3', 'backend', ['nodejs'], { company: '  ' }), // sin empresa: pickVacancy no la elige
      open('4', 'backend', ['nodejs'], { slug: null }), // sin enlace
      open('5', 'ventas', ['sales']), // puesto fuera del foco
      open('6', 'backend', ['nodejs']),
      open('7', 'devops', ['docker']),
      open('8', 'devops', ['docker']),
    ]
    const supply = buildSupply({ people, open: vacancies, usedInLinkedin: new Set(['2']), queued: [queued('frontend', ['react']), queued('ventas', ['sales'])], nextBatchAt: null, now: NOW })
    expect(supply.linkedin.reserve).toBe(4) // 1, 6, 7, 8
    expect(supply.linkedin.reserveDays).toBe(1)
    expect(supply.linkedin.perDay).toBe(LINKEDIN_PER_DAY)
    // con la cola: suma las de la cola del foco que le sirven a alguien (la de frontend sí, la de ventas no es del foco)
    expect(supply.linkedin.reserveWithQueue).toBe(5)
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

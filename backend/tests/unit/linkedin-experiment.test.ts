import { describe, it, expect, vi } from 'vitest'

vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: { from: () => ({}) } }))

import { assignFormat, buildExperiment, slotOf, EXPERIMENT_NAME, MIN_POSTS_PER_FORMAT, type ExperimentPost } from '@avotalent/core/services/linkedin/experiment'
import { buildPostText, type LinkedInVacancy } from '@avotalent/core/services/linkedin/vacancy-post'
import { experimentColumns } from '@avotalent/core/services/linkedin/vacancy-publisher'

// Monterrey es UTC-6: 18:30 allá = 00:30 UTC del día siguiente.
const monterrey = (iso: string) => new Date(`${iso}-06:00`)

describe('which post of the day it is', () => {
  it('counts the publication times that already started (8:30, 11:30, 14:30, 18:30 Monterrey)', () => {
    expect(slotOf(monterrey('2026-11-06T08:30:00'))).toBe(1)
    expect(slotOf(monterrey('2026-11-06T11:31:00'))).toBe(2)
    expect(slotOf(monterrey('2026-11-06T14:45:00'))).toBe(3)
    expect(slotOf(monterrey('2026-11-06T18:30:00'))).toBe(4)
    expect(slotOf(monterrey('2026-11-06T23:00:00'))).toBe(4)
    expect(slotOf(monterrey('2026-11-06T06:00:00'))).toBe(1) // antes del primer turno (prueba manual): se cuenta como el primero
  })
})

describe('assignFormat', () => {
  it('only the 4th post of the day takes part, and the first three keep the usual text with no experiment', () => {
    for (const hour of ['08:30', '11:30', '14:30']) {
      expect(assignFormat(monterrey(`2026-11-06T${hour}:00`))).toMatchObject({ experiment: null, format: 'texto_control', style: 'control' })
    }
    expect(assignFormat(monterrey('2026-11-06T18:30:00')).experiment).toBe(EXPERIMENT_NAME)
  })

  it('alternates by day with no randomness: even days the usual text, odd days the question, and the same moment always gives the same answer', () => {
    const days = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map((day) => assignFormat(monterrey(`${day}T18:30:00`)).format)
    expect(new Set(days.slice(0, 2)).size).toBe(2) // días seguidos: formatos distintos
    expect(days[0]).toBe(days[2])
    expect(days[1]).toBe(days[3])
    expect(assignFormat(monterrey('2026-11-06T18:30:00'))).toEqual(assignFormat(monterrey('2026-11-06T19:00:00'))) // el mismo día, la misma publicación
  })

  it('writes the three columns that mark the post', () => {
    expect(experimentColumns(assignFormat(monterrey('2026-11-06T18:30:00')))).toEqual({ format: expect.stringMatching(/^texto_/), experiment: EXPERIMENT_NAME, slot: 4 })
  })
})

describe('the question text', () => {
  const vacancy: LinkedInVacancy = {
    id: 'v1', slug: 'backend-stripe', title: 'Backend Engineer', company: 'Stripe', location: 'Monterrey', modalidad: 'Remoto', seniority_level: 'senior',
    role_category: 'backend', skills: ['nodejs'], budget: null, company_logo: null, created_at: '2026-11-01T00:00:00Z',
  } as unknown as LinkedInVacancy
  const url = 'https://avotalent.app/vacantes/backend-stripe'

  it('opens by speaking to the reader and keeps the same facts, link and hashtags; the usual text is untouched', () => {
    const control = buildPostText(vacancy, url, 0, { nodejs: 'Node.js' })
    const question = buildPostText(vacancy, url, 0, { nodejs: 'Node.js' }, 'pregunta')
    expect(control).toBe(buildPostText(vacancy, url, 0, { nodejs: 'Node.js' }, 'control'))
    expect(question.split('\n\n')[0]).toContain('¿Buscas tu próximo reto como')
    expect(question).toContain('Stripe')
    expect(question).toContain(url)
    expect(question).toContain('Antes de postularte')
    // lo que no cambia: los datos
    for (const line of control.split('\n\n')[1].split('\n')) expect(question).toContain(line)
    expect(question).not.toBe(control)
  })

  it('without a known role it falls back to the title instead of printing an empty gap', () => {
    const text = buildPostText({ ...vacancy, role_category: null } as unknown as LinkedInVacancy, url, 0, {}, 'pregunta')
    expect(text.split('\n\n')[0]).toBe('🎯 ¿Te ves como Backend Engineer? Stripe está contratando')
  })
})

describe('buildExperiment', () => {
  const post = (slug: string, format: string, day = '2026-11-02'): ExperimentPost => ({ post_key: '', vacancy_slug: slug, format, experiment: EXPERIMENT_NAME, published_at: `${day}T20:00:00Z` })
  const SINCE = '2026-10-30T14:13:00Z'

  it('says it is too early, and how many posts are missing, instead of declaring a winner', () => {
    const visits = new Map([['a', { people: 9, registered: 1 }], ['b', { people: 1, registered: 0 }]])
    const result = buildExperiment([post('a', 'texto_pregunta'), post('b', 'texto_control')], visits, SINCE)
    expect(result.comparable).toBe(false)
    expect(result.formats.find((row) => row.format === 'texto_pregunta')).toMatchObject({ posts: 1, arrivals: 9, registrations: 1, avgArrivals: 9, remaining: MIN_POSTS_PER_FORMAT - 1 })
    expect(result.verdict).toContain('Todavía es pronto')
  })

  it('leaves out posts that are not part of the experiment, or came out before AvoTalent measured origins', () => {
    const result = buildExperiment([
      { ...post('a', 'texto_pregunta'), experiment: null }, // no participó
      post('old', 'texto_pregunta', '2026-10-01'), // antes de la medición
      post('ok', 'texto_pregunta'),
    ], new Map([['ok', { people: 4, registered: 0 }]]), SINCE)
    expect(result.formats.find((row) => row.format === 'texto_pregunta')?.posts).toBe(1)
  })

  it('with the minimum reached, only calls a difference when one format brings at least double; otherwise it says there is no reason to change', () => {
    const many = (format: string, prefix: string) => Array.from({ length: MIN_POSTS_PER_FORMAT }, (_, i) => post(`${prefix}${i}`, format))
    const visits = (control: number, question: number) => new Map<string, { people: number; registered: number }>([
      ...Array.from({ length: MIN_POSTS_PER_FORMAT }, (_, i) => [`c${i}`, { people: control, registered: 0 }] as [string, { people: number; registered: number }]),
      ...Array.from({ length: MIN_POSTS_PER_FORMAT }, (_, i) => [`q${i}`, { people: question, registered: 0 }] as [string, { people: number; registered: number }]),
    ])
    const posts = [...many('texto_control', 'c'), ...many('texto_pregunta', 'q')]

    const big = buildExperiment(posts, visits(3, 7), SINCE)
    expect(big.comparable).toBe(true)
    expect(big.verdict).toContain('Texto con pregunta')
    expect(big.verdict).toContain('el doble')

    const small = buildExperiment(posts, visits(5, 6), SINCE)
    expect(small.verdict).toContain('no es grande')
  })

  it('does not break without the visits table', () => {
    const result = buildExperiment([post('a', 'texto_control')], null, SINCE)
    expect(result.formats.find((row) => row.format === 'texto_control')).toMatchObject({ posts: 1, arrivals: 0 })
  })
})

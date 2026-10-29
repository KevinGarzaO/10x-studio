import { describe, it, expect } from 'vitest'
import { DEFAULT_FILTERS, applyFeedFilters, feedSummary, isRemote, profileProgress } from '@/lib/feed-filters'

const article = (id: string) => ({ id })
const job = (id: string, modalidad: string | null, seniority_level: string | null) => ({ id, modalidad, seniority_level })
const fit = (id: string, modalidad: string | null, seniorityLevel: string | null) => ({ id, modalidad, seniorityLevel })

const input = {
  articles: [article('a1'), article('a2')],
  jobs: [job('j1', 'Remoto', 'senior'), job('j2', 'Presencial', 'senior'), job('j3', 'Remoto', 'junior')],
  forYou: [fit('f1', 'Remoto', 'senior'), fit('f2', 'Híbrido', 'junior')],
}
const ids = (items: { id: string }[]) => items.map(item => item.id)

describe('los filtros del feed', () => {
  it('sin filtros deja todo como está', () => {
    const result = applyFeedFilters(input, DEFAULT_FILTERS, 'senior')
    expect([ids(result.articles), ids(result.jobs), ids(result.forYou)]).toEqual([['a1', 'a2'], ['j1', 'j2', 'j3'], ['f1', 'f2']])
  })

  it('"Para ti" deja solo lo que encaja', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, view: 'forYou' }, 'senior')
    expect([result.articles, ids(result.jobs), ids(result.forYou)]).toEqual([[], [], ['f1', 'f2']])
  })

  it('"Vacantes" deja las vacantes (las que encajan y las demás) sin discusiones', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, view: 'jobs' }, 'senior')
    expect([result.articles, ids(result.jobs), ids(result.forYou)]).toEqual([[], ['j1', 'j2', 'j3'], ['f1', 'f2']])
  })

  it('"Discusiones" deja solo las publicaciones', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, view: 'posts' }, 'senior')
    expect([ids(result.articles), result.jobs, result.forYou]).toEqual([['a1', 'a2'], [], []])
  })

  it('"Remoto" deja solo vacantes remotas, y esconde las discusiones', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, remote: true }, 'senior')
    expect([result.articles, ids(result.jobs), ids(result.forYou)]).toEqual([[], ['j1', 'j3'], ['f1']])
  })

  it('"Mi nivel" deja solo vacantes de tu nivel', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, myLevel: true }, 'senior')
    expect([ids(result.jobs), ids(result.forYou)]).toEqual([['j1', 'j2'], ['f1']])
  })

  it('se pueden combinar: remoto y de tu nivel', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, remote: true, myLevel: true }, 'senior')
    expect([ids(result.jobs), ids(result.forYou)]).toEqual([['j1'], ['f1']])
  })

  it('si no se sabe tu nivel, "Mi nivel" no esconde nada', () => {
    const result = applyFeedFilters(input, { ...DEFAULT_FILTERS, myLevel: true }, null)
    expect(ids(result.jobs)).toEqual(['j1', 'j2', 'j3'])
  })

  it('reconoce lo remoto sin importar mayúsculas ni acentos de la frase', () => {
    expect(isRemote('Remoto')).toBe(true)
    expect(isRemote('100% remote')).toBe(true)
    expect(isRemote('Presencial')).toBe(false)
    expect(isRemote(null)).toBe(false)
  })
})

describe('el avance del perfil', () => {
  it('cuenta los seis datos y dice cuáles faltan', () => {
    const progress = profileProgress({ photo_url: 'x', role_category: 'qa', seniority: 'senior', location: 'MX', work_modality: 'Remoto', skills: ['a', 'b'] })
    expect(progress.percent).toBe(83)
    expect(progress.missing).toEqual(['al menos 5 skills'])
  })

  it('un perfil completo está al 100 %', () => {
    expect(profileProgress({ photo_url: 'x', role_category: 'qa', seniority: 'senior', location: 'MX', work_modality: 'Remoto', skills: ['a', 'b', 'c', 'd', 'e'] })).toEqual({ percent: 100, missing: [] })
  })

  it('sin nada está en 0 y no se rompe con datos faltantes', () => {
    expect(profileProgress(null).percent).toBe(0)
    expect(profileProgress({ skills: 'no-es-lista' }).percent).toBe(0)
  })
})

describe('el resumen de la cabecera', () => {
  it('junta solo lo que se sabe y es mayor a cero', () => {
    expect(feedSummary({ open: 462, newToday: 18, fit: 12 })).toBe('462 vacantes abiertas · 18 nuevas hoy · 12 encajan contigo')
    expect(feedSummary({ open: 462 })).toBe('462 vacantes abiertas')
    expect(feedSummary({ open: 1, newToday: 1, fit: 1 })).toBe('1 vacante abierta · 1 nueva hoy · 1 encaja contigo')
    expect(feedSummary({ open: 0, newToday: null, fit: undefined })).toBe('')
  })
})

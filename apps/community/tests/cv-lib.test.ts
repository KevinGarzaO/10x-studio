import { describe, it, expect } from 'vitest'
import { emptyCv, cvSchema, type Cv } from '@avocado/schemas'
import { formatMonth, formatPeriod, formatYears, newestFirst, studiesNewestFirst, toSafeUrl, validateCv, newExperience } from '@/lib/cv'

const job = (company: string, startDate: string, endDate: string | null) => ({
  company, position: 'Dev', location: '', startDate, endDate, description: '',
})

describe('dates', () => {
  it('writes a month the way a CV does', () => {
    expect(formatMonth('2024-03')).toBe('mar 2024')
    expect(formatMonth('2021-12')).toBe('dic 2021')
  })

  it('leaves anything that is not YYYY-MM as it came', () => {
    expect(formatMonth('')).toBe('')
    expect(formatMonth('marzo')).toBe('marzo')
    expect(formatMonth('2024-13')).toBe('2024-13')
  })

  it('writes a period, and calls an open one "Actual"', () => {
    expect(formatPeriod('2022-03', '2024-06')).toBe('mar 2022 – jun 2024')
    expect(formatPeriod('2022-03', null)).toBe('mar 2022 – Actual')
    expect(formatYears('2014', '2018')).toBe('2014 – 2018')
    expect(formatYears('2022', null)).toBe('2022 – Actual')
  })
})

describe('ordering', () => {
  it('puts the current job first and then the most recent', () => {
    const ordered = newestFirst([
      job('Vieja', '2015-01', '2017-01'),
      job('Reciente', '2019-01', '2021-06'),
      job('Actual', '2022-01', null),
    ])

    expect(ordered.map(j => j.company)).toEqual(['Actual', 'Reciente', 'Vieja'])
  })

  it('breaks ties by the start date, and does not mutate the original list', () => {
    const list = [job('A', '2020-01', '2022-01'), job('B', '2021-01', '2022-01')]
    expect(newestFirst(list).map(j => j.company)).toEqual(['B', 'A'])
    expect(list.map(j => j.company)).toEqual(['A', 'B'])
  })

  it('orders studies with the one still in progress first', () => {
    const ordered = studiesNewestFirst([
      { institution: 'A', degree: 'x', field: '', startYear: '2010', endYear: '2014' },
      { institution: 'B', degree: 'x', field: '', startYear: '2020', endYear: null },
    ])

    expect(ordered.map(s => s.institution)).toEqual(['B', 'A'])
  })
})

describe('toSafeUrl', () => {
  it('adds the protocol when it is missing', () => {
    expect(toSafeUrl('linkedin.com/in/ana')).toBe('https://linkedin.com/in/ana')
    expect(toSafeUrl('  github.com/ana  ')).toBe('https://github.com/ana')
  })

  it('keeps an http(s) link as it is', () => {
    expect(toSafeUrl('https://sitio.mx/a?b=1')).toBe('https://sitio.mx/a?b=1')
    expect(toSafeUrl('http://sitio.mx')).toBe('http://sitio.mx')
  })

  it('never produces a link out of a script or data URL, or out of nothing', () => {
    for (const bad of ['javascript:alert(1)//.com', 'JavaScript:alert(1).x', 'data:text/html,hola.com', 'ftp://x.com', 'no es un enlace', '', null, undefined]) {
      expect(toSafeUrl(bad as string), String(bad)).toBeNull()
    }
  })
})

describe('validateCv', () => {
  it('accepts an empty CV and a complete one', () => {
    expect(validateCv(emptyCv())).toBeNull()
    expect(validateCv(cvSchema.parse({ summary: 'hola', experience: [job('X', '2022-01', null)] }))).toBeNull()
  })

  it('says where the problem is, with the entry number', () => {
    const cv: Cv = { ...emptyCv(), experience: [job('X', '2022-01', null), { ...newExperience(), position: 'Dev', startDate: '2023-01' }] }
    expect(validateCv(cv)).toBe('Experiencia 2: Falta la empresa')
  })

  it('names the section for a blank new entry', () => {
    const cv: Cv = { ...emptyCv(), languages: [{ name: '', level: 'basico' }] }
    expect(validateCv(cv)).toBe('Idiomas 1: Falta el idioma')
  })

  it('catches a bad link and a bad email in the contact data', () => {
    expect(validateCv({ ...emptyCv(), linkedinUrl: 'javascript:alert(1)//.com' })).toMatch(/^Contacto: /)
    expect(validateCv({ ...emptyCv(), contactEmail: 'ana@' })).toMatch(/^Contacto: /)
  })

  it('catches a job that ends before it starts', () => {
    const cv: Cv = { ...emptyCv(), experience: [job('X', '2024-06', '2022-01')] }
    expect(validateCv(cv)).toBe('Experiencia 1: La fecha de fin no puede ser anterior a la de inicio')
  })
})

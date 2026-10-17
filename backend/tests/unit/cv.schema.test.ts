import { describe, it, expect } from 'vitest'
import { cvSchema, cvPayloadSchema, emptyCv, parseStoredCv, cvHasContent, CV_LIMITS } from '@avocado/schemas'

const job = { company: 'Stripe', position: 'Backend Engineer', startDate: '2022-03', endDate: '2024-06' }
const study = { institution: 'UANL', degree: 'Ingeniería en Sistemas', startYear: '2014', endYear: '2018' }

describe('cvSchema', () => {
  it('accepts an empty CV: it is filled in little by little and never blocks anyone', () => {
    const cv = cvSchema.parse({})

    expect(cv.summary).toBe('')
    expect(cv.experience).toEqual([])
    expect(cv.education).toEqual([])
    expect(cv.languages).toEqual([])
  })

  it('accepts a complete CV and trims the text', () => {
    const cv = cvSchema.parse({
      summary: '  Ingeniero con 6 años de experiencia  ',
      contactEmail: 'ana@correo.com',
      phone: ' +52 81 1234 5678 ',
      linkedinUrl: 'https://linkedin.com/in/ana',
      experience: [{ ...job, description: '  Construí APIs  ' }],
      education: [study],
      languages: [{ name: ' Inglés ', level: 'avanzado' }],
      certifications: [{ name: 'AWS Solutions Architect', issuer: 'Amazon', year: '2023' }],
      projects: [{ name: 'AvoTalent', url: 'avotalent.io', description: 'Bolsa de trabajo' }],
    })

    expect(cv.summary).toBe('Ingeniero con 6 años de experiencia')
    expect(cv.phone).toBe('+52 81 1234 5678')
    expect(cv.experience[0].description).toBe('Construí APIs')
    expect(cv.languages[0].name).toBe('Inglés')
  })

  describe('experience', () => {
    it('needs company, position and a start date', () => {
      expect(cvSchema.safeParse({ experience: [{ ...job, company: '  ' }] }).success).toBe(false)
      expect(cvSchema.safeParse({ experience: [{ ...job, position: '' }] }).success).toBe(false)
      expect(cvSchema.safeParse({ experience: [{ company: 'X', position: 'Y' }] }).success).toBe(false)
    })

    it('treats a missing end date as the current job', () => {
      const cv = cvSchema.parse({ experience: [{ company: 'X', position: 'Y', startDate: '2024-01' }] })
      expect(cv.experience[0].endDate).toBeNull()
    })

    it('rejects dates that are not YYYY-MM or that end before they start', () => {
      expect(cvSchema.safeParse({ experience: [{ ...job, startDate: 'marzo 2022' }] }).success).toBe(false)
      expect(cvSchema.safeParse({ experience: [{ ...job, startDate: '2022-13' }] }).success).toBe(false)

      const backwards = cvSchema.safeParse({ experience: [{ ...job, startDate: '2024-06', endDate: '2022-03' }] })
      expect(backwards.success).toBe(false)
      if (!backwards.success) expect(backwards.error.issues[0].path).toContain('endDate')
    })
  })

  describe('education', () => {
    it('needs institution, degree and a start year; no end year means still studying', () => {
      expect(cvSchema.parse({ education: [{ ...study, endYear: undefined }] }).education[0].endYear).toBeNull()
      expect(cvSchema.safeParse({ education: [{ ...study, institution: '' }] }).success).toBe(false)
      expect(cvSchema.safeParse({ education: [{ ...study, startYear: '14' }] }).success).toBe(false)
    })

    it('rejects an end year before the start year', () => {
      expect(cvSchema.safeParse({ education: [{ ...study, startYear: '2018', endYear: '2014' }] }).success).toBe(false)
    })
  })

  describe('languages, certifications and projects', () => {
    it('only accepts the known language levels', () => {
      expect(cvSchema.safeParse({ languages: [{ name: 'Inglés', level: 'fluido' }] }).success).toBe(false)
      for (const level of ['basico', 'intermedio', 'avanzado', 'nativo']) {
        expect(cvSchema.safeParse({ languages: [{ name: 'Inglés', level }] }).success).toBe(true)
      }
    })

    it('lets a certification skip its issuer and year, but not a made-up year', () => {
      expect(cvSchema.safeParse({ certifications: [{ name: 'PMP' }] }).success).toBe(true)
      expect(cvSchema.safeParse({ certifications: [{ name: 'PMP', year: '23' }] }).success).toBe(false)
    })

    it('checks that a project link looks like a link, but allows it to be empty', () => {
      expect(cvSchema.safeParse({ projects: [{ name: 'X', url: '' }] }).success).toBe(true)
      expect(cvSchema.safeParse({ projects: [{ name: 'X', url: 'https://github.com/x/y' }] }).success).toBe(true)
      expect(cvSchema.safeParse({ projects: [{ name: 'X', url: 'no es un enlace' }] }).success).toBe(false)
    })
  })

  it('only accepts web links, never a script or data URL', () => {
    for (const url of ['javascript:alert(1)//.com', 'data:text/html,<script>.x', 'JAVASCRIPT:alert(1).com', 'ftp://x.com', 'vbscript:x.com']) {
      expect(cvSchema.safeParse({ linkedinUrl: url }).success, url).toBe(false)
      expect(cvSchema.safeParse({ projects: [{ name: 'X', url }] }).success, url).toBe(false)
    }
    for (const url of ['linkedin.com/in/ana', 'https://github.com/ana/repo?tab=readme', 'http://sitio.mx/a/b#c', 'avotalent.io']) {
      expect(cvSchema.safeParse({ linkedinUrl: url }).success, url).toBe(true)
    }
  })

  it('checks the contact email and the LinkedIn link', () => {
    expect(cvSchema.safeParse({ contactEmail: 'ana@' }).success).toBe(false)
    expect(cvSchema.safeParse({ contactEmail: '' }).success).toBe(true)
    expect(cvSchema.safeParse({ linkedinUrl: 'esto no es una url' }).success).toBe(false)
  })

  it('caps how much a CV can hold', () => {
    const tooMany = Array.from({ length: CV_LIMITS.experience + 1 }, () => job)
    expect(cvSchema.safeParse({ experience: tooMany }).success).toBe(false)
    expect(cvSchema.safeParse({ summary: 'x'.repeat(1201) }).success).toBe(false)
  })

  it('drops anything it does not know about instead of storing it', () => {
    const cv = cvSchema.parse({ summary: 'hola', isAdmin: true, script: '<script>' }) as Record<string, unknown>
    expect(cv.isAdmin).toBeUndefined()
    expect(cv.script).toBeUndefined()
  })
})

describe('cvPayloadSchema', () => {
  it('keeps the CV private unless it is made public on purpose', () => {
    expect(cvPayloadSchema.parse({ cv: {} }).public).toBe(false)
    expect(cvPayloadSchema.parse({ cv: {}, public: true }).public).toBe(true)
  })

  it('rejects a public flag that is not a boolean', () => {
    expect(cvPayloadSchema.safeParse({ cv: {}, public: 'si' }).success).toBe(false)
  })
})

describe('parseStoredCv and cvHasContent', () => {
  it('reads an account that has no CV yet', () => {
    expect(parseStoredCv(null)).toEqual(emptyCv())
    expect(parseStoredCv({})).toEqual(emptyCv())
    expect(parseStoredCv(undefined)).toEqual(emptyCv())
  })

  it('does not break on a stored document that is malformed or from an older shape', () => {
    expect(parseStoredCv('basura')).toEqual(emptyCv())
    expect(parseStoredCv({ experience: 'no es una lista' })).toEqual(emptyCv())
    expect(parseStoredCv({ summary: 'hola' }).summary).toBe('hola')
  })

  it('tells an empty CV from one with something written', () => {
    expect(cvHasContent(emptyCv())).toBe(false)
    expect(cvHasContent(cvSchema.parse({ summary: 'hola' }))).toBe(true)
    expect(cvHasContent(cvSchema.parse({ languages: [{ name: 'Inglés', level: 'basico' }] }))).toBe(true)
  })
})

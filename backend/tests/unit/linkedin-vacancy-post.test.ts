import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildPostText,
  cardFor,
  completeness,
  pickVacancy,
  placeOf,
  vacancyUrl,
  COMPANY_COOLDOWN_DAYS,
  ROLE_FOCUS,
  TOP_BANDS,
  publishScore,
  type LinkedInVacancy,
  type PostedVacancy,
} from '@avotalent/core/services/linkedin/vacancy-post'

let n = 0
const vacancy = (patch: Partial<LinkedInVacancy> = {}): LinkedInVacancy => ({
  id: `v${++n}`,
  slug: `vacante-${n}`,
  title: 'Backend Engineer',
  company: `Empresa ${n}`,
  location: 'Dublin',
  modalidad: 'Remoto',
  seniority_level: 'senior',
  role_category: 'backend',
  skills: ['python', 'aws'],
  budget: null,
  company_logo: null,
  created_at: '2026-10-01T10:00:00Z',
  ...patch,
})

const daysAgo = (days: number, now = new Date('2026-10-04T12:00:00Z')) => new Date(now.getTime() - days * 86400000).toISOString()
const NOW = new Date('2026-10-04T12:00:00Z')

describe('vacancyUrl', () => {
  it('marks the link as coming from LinkedIn and says which vacancy it was', () => {
    const url = new URL(vacancyUrl('https://avotalent.com/', 'backend-engineer-1'))
    expect(url.origin + url.pathname).toBe('https://avotalent.com/vacantes/backend-engineer-1')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'vacante-auto',
      utm_content: 'backend-engineer-1',
    })
  })
})

describe('buildPostText', () => {
  const full = vacancy({ title: 'Backend Engineer', company: 'Stripe', location: 'Dublin', budget: 'USD 90k–120k', skills: ['go', 'aws'] })

  it('writes everything the vacancy has', () => {
    const text = buildPostText(full, 'https://x.test/v', 0, { go: 'Go', aws: 'AWS' })

    expect(text).toContain('Backend Engineer')
    expect(text).toContain('Stripe')
    expect(text).toContain('📍 Dublin · Remoto')
    expect(text).toContain('Puesto: Desarrollo Backend · Nivel: Senior')
    expect(text).toContain('🧩 Skills: Go · AWS')
    expect(text).toContain('💰 USD 90k–120k')
    expect(text).toContain('https://x.test/v')
    expect(text).toContain('Regístrate gratis en AvoTalent')
    expect(text).toMatch(/#Backend/)
  })

  it('never writes a line for data it does not have', () => {
    const text = buildPostText(vacancy({ budget: null, seniority_level: null, modalidad: 'No especificado', location: null, skills: [] }), 'https://x.test/v')

    expect(text).not.toMatch(/💰|🧩|📍/)
    expect(text).not.toMatch(/no especificado|null|undefined|Nivel:/i)
    expect(text).toContain('Puesto: Desarrollo Backend')
  })

  it('has no triple blank lines', () => {
    expect(buildPostText(vacancy({ location: null, modalidad: null, skills: [] }), 'u')).not.toMatch(/\n\n\n/)
  })

  it('alternates the opening without randomness', () => {
    const openings = [0, 1, 2, 3].map(variant => buildPostText(full, 'u', variant).split('\n')[0])
    expect(new Set(openings).size).toBe(4)
    expect(buildPostText(full, 'u', 4).split('\n')[0]).toBe(openings[0])
    expect(buildPostText(full, 'u', 1)).toBe(buildPostText(full, 'u', 1))
  })

  it('uses the catalog name of a skill and falls back to its identifier', () => {
    const text = buildPostText(vacancy({ skills: ['golang', 'sin-etiqueta'] }), 'u', 0, { golang: 'Go' })
    expect(text).toContain('Go · sin-etiqueta')
  })

  it('writes at most five skills and four hashtags', () => {
    const text = buildPostText(vacancy({ skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), 'u')
    expect(text.match(/🧩 Skills: (.*)/)![1].split(' · ')).toHaveLength(5)
    expect(text.split('\n').pop()!.split(' ').length).toBeLessThanOrEqual(4)
  })
})

describe('placeOf', () => {
  it('does not repeat the same word', () => {
    expect(placeOf(vacancy({ location: 'Remoto', modalidad: 'Remoto' }))).toBe('Remoto')
  })

  it('shortens a long list of cities', () => {
    expect(placeOf(vacancy({ location: 'San Francisco, CA • New York, NY • Seattle, WA', modalidad: 'Híbrido' }))).toBe(
      'San Francisco, CA / New York, NY +1 · Híbrido',
    )
  })

  it('is empty when nothing is known', () => {
    expect(placeOf(vacancy({ location: null, modalidad: null }))).toBe('')
  })
})

describe('completeness', () => {
  it('scores more for a vacancy with more real data', () => {
    const bare = vacancy({ seniority_level: null, modalidad: 'No especificado', skills: [], budget: null, location: null })
    const rich = vacancy({ budget: 'USD 100k', skills: ['a', 'b', 'c'], company_logo: 'https://x/logo.png' })
    expect(completeness(rich)).toBeGreaterThan(completeness(bare))
  })
})

describe('pickVacancy', () => {
  it('picks the most complete vacancy', () => {
    const poor = vacancy({ skills: [], budget: null })
    const rich = vacancy({ skills: ['a', 'b', 'c'], budget: 'USD 100k' })
    expect(pickVacancy([poor, rich], [], NOW)).toBe(rich)
  })

  it('breaks ties by recency', () => {
    const old = vacancy({ created_at: '2026-09-01T00:00:00Z' })
    const fresh = vacancy({ created_at: '2026-10-03T00:00:00Z' })
    expect(pickVacancy([old, fresh], [], NOW)).toBe(fresh)
  })

  it('does not repeat a company inside the cooldown', () => {
    const history: PostedVacancy[] = [{ company: 'Stripe', role_category: 'ventas', published_at: daysAgo(COMPANY_COOLDOWN_DAYS - 1) }]
    const stripe = vacancy({ company: 'Stripe', budget: 'USD 1', skills: ['a', 'b', 'c'] })
    const other = vacancy({ company: 'Twilio' })
    expect(pickVacancy([stripe, other], history, NOW)).toBe(other)
  })

  it('allows the company again after the cooldown', () => {
    const history: PostedVacancy[] = [{ company: 'Stripe', role_category: 'ventas', published_at: daysAgo(COMPANY_COOLDOWN_DAYS + 1) }]
    const stripe = vacancy({ company: 'Stripe', budget: 'USD 1', skills: ['a', 'b', 'c'] })
    expect(pickVacancy([stripe, vacancy()], history, NOW)).toBe(stripe)
  })

  it('avoids the role of the last posts, so the profile is not one kind of job', () => {
    const history: PostedVacancy[] = ['backend', 'backend', 'backend'].map((role, i) => ({ company: `X${i}`, role_category: role, published_at: daysAgo(i + 10) }))
    // Casi igual de buenas (dentro de la banda de los mejores): se alterna el rol. Si una fuera mucho mejor, ganaría ella
    // (ver "always one of the best").
    const another = vacancy({ role_category: 'backend', skills: ['a', 'b'] })
    const different = vacancy({ role_category: 'frontend', skills: ['a', 'b'] })
    expect(pickVacancy([another, different], history, NOW)).toBe(different)
  })

  it('relaxes the rules rather than staying silent', () => {
    const history: PostedVacancy[] = [{ company: 'Stripe', role_category: 'backend', published_at: daysAgo(1) }]
    const only = vacancy({ company: 'Stripe', role_category: 'backend' })
    expect(pickVacancy([only], history, NOW)).toBe(only)
  })

  describe('always one of the best (4 posts a day)', () => {
    // Una vacante con el puntaje que se pida: se arma con datos reales para no depender de cómo se calcula por dentro.
    const strong = (patch: Partial<LinkedInVacancy> = {}) => vacancy({ skills: ['a', 'b', 'c', 'd', 'e'], budget: 'USD 100k', ...patch })

    it('between two good ones prefers the one that does not repeat the role, but never drops far for it', () => {
      const history: PostedVacancy[] = ['backend', 'backend', 'backend'].map((role, i) => ({ company: `X${i}`, role_category: role, published_at: daysAgo(i + 10) }))
      const topSameRole = strong({ role_category: 'backend' })
      const closeOtherRole = strong({ role_category: 'fullstack', skills: ['a', 'b', 'c', 'd'] }) // un punto menos
      expect(publishScore(topSameRole) - publishScore(closeOtherRole)).toBeLessThanOrEqual(TOP_BANDS[0])
      expect(pickVacancy([topSameRole, closeOtherRole], history, NOW)).toBe(closeOtherRole)
    })

    it('does NOT trade a top vacancy for a mediocre one just to change the role', () => {
      const history: PostedVacancy[] = ['backend', 'backend', 'backend'].map((role, i) => ({ company: `X${i}`, role_category: role, published_at: daysAgo(i + 10) }))
      const top = strong({ role_category: 'backend' })
      const weak = vacancy({ role_category: 'data_scientist', skills: [], budget: null, seniority_level: 'junior', modalidad: 'Presencial' })
      expect(publishScore(top) - publishScore(weak)).toBeGreaterThan(TOP_BANDS[0])
      // el rol se repite, pero la mejor no se cambia por una que está muy por debajo
      expect(pickVacancy([top, weak], history, NOW)).toBe(top)
    })

    it('still never repeats a company inside the cooldown if another good one exists, opening the band before repeating it', () => {
      const history: PostedVacancy[] = [{ company: 'Stripe', role_category: 'ventas', published_at: daysAgo(1) }]
      const stripe = strong({ company: 'Stripe' })
      const other = vacancy({ company: 'Twilio', skills: ['a', 'b'], budget: null })
      expect(publishScore(stripe) - publishScore(other)).toBeGreaterThan(TOP_BANDS[0])
      expect(pickVacancy([stripe, other], history, NOW)).toBe(other)
    })

    it('always takes the best of the pool when nothing needs varying', () => {
      const pool = [vacancy({ skills: [] }), strong(), vacancy({ skills: ['a', 'b'] })]
      expect(pickVacancy(pool, [], NOW)).toBe(pool[1])
    })

    it('over a whole week of 4 a day the choices stay among the best and no company repeats inside the cooldown', () => {
      const pool: LinkedInVacancy[] = []
      const roles = Object.keys(ROLE_FOCUS)
      for (let i = 0; i < 120; i++) {
        pool.push(vacancy({
          company: `Empresa-${i % 60}`,
          role_category: roles[i % roles.length],
          skills: Array.from({ length: (i * 7) % 6 }, (_, k) => `s${k}`),
          budget: i % 3 === 0 ? 'USD 80k' : null,
        }))
      }
      const best28 = pool.map((v) => publishScore(v)).sort((a, b) => b - a).slice(0, 28)
      const average = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length

      const history: PostedVacancy[] = []
      const chosen: LinkedInVacancy[] = []
      const remaining = [...pool]
      for (let turn = 0; turn < 28; turn++) {
        const when = new Date(NOW.getTime() + turn * 3.5 * 3600000)
        const pick = pickVacancy(remaining, history, when)!
        remaining.splice(remaining.indexOf(pick), 1)
        history.push({ company: pick.company, role_category: pick.role_category, published_at: when.toISOString() })
        chosen.push(pick)
      }
      expect(average(chosen.map((v) => publishScore(v)))).toBeGreaterThan(average(best28) - 3)
      expect(new Set(chosen.map((v) => v.company)).size).toBe(28) // ninguna empresa dos veces en la semana
    })
  })

  it('skips vacancies without a company or a page', () => {
    expect(pickVacancy([vacancy({ company: null }), vacancy({ slug: null })], [], NOW)).toBeNull()
    expect(pickVacancy([], [], NOW)).toBeNull()
  })
})

describe('the role focus', () => {
  it('only publishes the roles that bring this audience', () => {
    for (const role of ['marketing', 'finanzas', 'administracion', 'recursos_humanos', 'ventas', 'legal', 'customer_support', 'otro']) {
      expect(pickVacancy([vacancy({ role_category: role })], [], NOW)).toBeNull()
    }
    for (const role of Object.keys(ROLE_FOCUS)) {
      expect(pickVacancy([vacancy({ role_category: role })], [], NOW)).not.toBeNull()
    }
  })

  it('ignores a complete vacancy of a role outside the focus in favor of a plainer one inside it', () => {
    const marketing = vacancy({ role_category: 'marketing', budget: 'USD 100k', skills: ['a', 'b', 'c', 'd', 'e'] })
    const backend = vacancy({ role_category: 'backend', skills: [] })
    expect(pickVacancy([marketing, backend], [], NOW)).toBe(backend)
  })

  it('prefers the roles that convert most, senior level and remote work', () => {
    const base = { skills: ['a', 'b'], budget: null }
    const strong = vacancy({ ...base, role_category: 'fullstack', seniority_level: 'senior', modalidad: 'Remoto' })
    const weakRole = vacancy({ ...base, role_category: 'data_scientist', seniority_level: 'senior', modalidad: 'Remoto' })
    const junior = vacancy({ ...base, role_category: 'fullstack', seniority_level: 'junior', modalidad: 'Remoto' })
    const onsite = vacancy({ ...base, role_category: 'fullstack', seniority_level: 'senior', modalidad: 'Presencial' })

    expect(publishScore(strong)).toBeGreaterThan(publishScore(weakRole))
    expect(publishScore(strong)).toBeGreaterThan(publishScore(junior))
    expect(publishScore(strong)).toBeGreaterThan(publishScore(onsite))
    expect(pickVacancy([weakRole, onsite, junior, strong], [], NOW)).toBe(strong)
  })

  it('says nothing is available rather than falling back to a role outside the focus', () => {
    expect(pickVacancy([vacancy({ role_category: 'marketing' }), vacancy({ role_category: 'ventas' })], [], NOW)).toBeNull()
  })
})

describe('cardFor', () => {
  it('gives the link card a title and a description with the key facts', () => {
    const card = cardFor(vacancy({ title: 'Backend Engineer', company: 'Stripe', location: 'Dublin' }))
    expect(card.title).toBe('Backend Engineer — Stripe')
    expect(card.description).toContain('Desarrollo Backend')
    expect(card.description).toContain('Dublin')
  })
})

describe('the migration', () => {
  const sql = readFileSync(join(__dirname, '../../sql/linkedin-vacancies-attribution-migration.sql'), 'utf8').replace(/\r\n/g, '\n')

  it('creates the tables closed to the public keys', () => {
    for (const table of ['linkedin_vacancy_posts', 'landing_visits']) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON ${table} FROM anon, authenticated`))
    }
    expect(sql).toMatch(/REVOKE ALL ON acquisition_by_source FROM anon, authenticated/)
  })

  it('stops the same vacancy from being published twice', () => {
    expect(sql).toMatch(/vacancy_id\s+UUID UNIQUE/)
  })

  it('adds the six signup columns safely', () => {
    for (const column of ['source', 'medium', 'campaign', 'content', 'referrer', 'landing_path']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS signup_${column}`)
    }
  })
})

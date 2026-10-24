import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const day = 86400000
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()

const catalog = [
  { name: 'react', label: 'React' },
  { name: 'python', label: 'Python' },
  { name: 'cobol', label: 'COBOL' },
]

const posts = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))
const seen = vi.hoisted(() => ({ selects: [] as string[], filters: [] as string[] }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => ({
      select: (fields: string) => {
        seen.selects.push(`${table}:${fields}`)
        let single = false
        const q: any = {}
        for (const name of ['eq', 'not', 'gte', 'neq', 'contains', 'order', 'limit']) {
          q[name] = (...args: unknown[]) => { seen.filters.push(`${name}:${args.join(',')}`); return q }
        }
        q.maybeSingle = () => { single = true; return q }
        q.then = (resolve: any, reject: any) => {
          if (table === 'skills') {
            const wanted = seen.filters.find(f => f.startsWith('eq:name,'))?.split(',')[1]
            return Promise.resolve({ data: single ? catalog.find(skill => skill.name === wanted) ?? null : catalog, error: null }).then(resolve, reject)
          }
          const slug = seen.filters.find(f => f.startsWith('eq:slug,'))?.split(',')[1]
          const data = single ? posts.rows.find(row => row.slug === slug) ?? null : posts.rows
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        }
        return q
      },
    }),
  },
}))

import router, { clearSeoCache } from '../../src/routes/community/seo.routes'
import { seoDescription } from '../../services/seo/vacancy-description'

const app = () => {
  const a = express()
  a.use('/seo', router)
  return a
}

const post = (patch: Record<string, unknown> = {}) => ({
  id: 'v1', slug: 'backend-engineer-1', title: 'Backend Engineer', company: 'Stripe', company_logo: null, location: 'Dublin',
  modalidad: 'Remoto', seniority_level: 'senior', role_category: 'backend', skills: ['python'], budget: null, created_at: iso(3), ...patch,
})

beforeEach(() => {
  seen.selects.length = 0
  seen.filters.length = 0
  posts.rows = []
  clearSeoCache()
})

describe('seoDescription', () => {
  it('drops the contact section and everything after it', () => {
    const text = '## Backend Engineer\n**Empresa:** Stripe\nBuild payment APIs in Python.\n\n### Contacto\nEmail: jefe@stripe.com\nTel: +52 81 1234 5678'
    const html = seoDescription(text, 'Backend Engineer')!

    expect(html).toContain('Build payment APIs in Python.')
    expect(html).not.toMatch(/jefe@stripe|1234|Contacto|Email/)
  })

  it('also drops a contact line written inline, in bold', () => {
    const html = seoDescription('Great job. ***Contacto:*** apply@x.com', 'T')!
    expect(html).toContain('Great job.')
    expect(html).not.toContain('apply@x.com')
  })

  it('removes the repeated title and the header lines that have their own fields', () => {
    const html = seoDescription('## Backend Engineer\n**Empresa:** Stripe\n**Ubicación:** Dublin\n**Modalidad:** Remoto\nSolid description.', 'Backend Engineer')!
    expect(html).toBe('<p>Solid description.</p>')
  })

  it('turns the HTML the scraper stores into plain paragraphs, escaped', () => {
    const html = seoDescription('&lt;p&gt;We use &lt;strong&gt;Python&lt;/strong&gt; &amp; Docker.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Remote&lt;/li&gt;&lt;/ul&gt;', 'T')!

    expect(html).toContain('We use Python &amp; Docker.')
    expect(html).toContain('<p>Remote</p>')
    expect(html).not.toMatch(/<strong>|<ul>|<li>/)
  })

  it('cannot carry a script into the page', () => {
    const html = seoDescription('Hello &lt;script&gt;alert(1)&lt;/script&gt; world', 'T')!
    expect(html).not.toContain('<script')
  })

  it('cuts very long text', () => {
    const html = seoDescription('palabra '.repeat(2000), 'T')!
    expect(html.length).toBeLessThan(5000)
  })

  it('is null when nothing useful is left', () => {
    expect(seoDescription(null, 'T')).toBeNull()
    expect(seoDescription('## T\n**Empresa:** X', 'T')).toBeNull()
  })
})

describe('GET /seo/skills', () => {
  it('lists only the skills that have open vacancies, with their count', async () => {
    posts.rows = [post({ skills: ['python', 'react'] }), post({ id: 'v2', skills: ['python'] })]

    const res = await request(app()).get('/seo/skills').expect(200)

    expect(res.body.skills).toEqual([
      { name: 'python', label: 'Python', vacancies: 2 },
      { name: 'react', label: 'React', vacancies: 1 },
    ])
  })

  it('looks only at vacancies of the last 45 days', async () => {
    await request(app()).get('/seo/skills')
    const since = seen.filters.find(f => f.startsWith('gte:created_at,'))!.split(',')[1]
    const days = (Date.now() - Date.parse(since)) / day
    expect(days).toBeGreaterThan(44.9)
    expect(days).toBeLessThan(45.1)
  })
})

describe('GET /seo/vacancies', () => {
  it('returns only public fields, never contacts or the full content', async () => {
    posts.rows = [post()]

    const res = await request(app()).get('/seo/vacancies').expect(200)

    expect(res.body.vacancies).toHaveLength(1)
    const requested = seen.selects.find(s => s.startsWith('community_posts:'))!
    for (const forbidden of ['contacts', 'content', 'original_text', 'source_url', 'email', 'phone']) {
      expect(requested).not.toContain(forbidden)
    }
  })

  it('filters by skill and can leave one vacancy out', async () => {
    await request(app()).get('/seo/vacancies?skill=Python&exclude=mi-slug&limit=4')

    expect(seen.filters).toContain('contains:skills,["python"]')
    expect(seen.filters).toContain('neq:slug,mi-slug')
    expect(seen.filters).toContain('limit:4')
  })

  it('never returns more than 100', async () => {
    await request(app()).get('/seo/vacancies?limit=99999')
    expect(seen.filters).toContain('limit:100')
  })
})

describe('GET /seo/vacancy/:slug', () => {
  it('gives the safe fields and a description without the contact section', async () => {
    posts.rows = [post({ original_text: '## Backend Engineer\nBuild APIs.\n### Contacto\nEmail: jefe@stripe.com', content: 'jefe@stripe.com', contacts: { email: 'jefe@stripe.com' } })]

    const res = await request(app()).get('/seo/vacancy/backend-engineer-1').expect(200)

    expect(res.body.vacancy.description).toBe('<p>Build APIs.</p>')
    expect(res.body.vacancy.expired).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/jefe@stripe|contacts|original_text/)
  })

  it('marks a vacancy older than 45 days as expired, but still returns it', async () => {
    posts.rows = [post({ created_at: iso(60), original_text: 'Old job.' })]

    const res = await request(app()).get('/seo/vacancy/backend-engineer-1').expect(200)

    expect(res.body.vacancy.expired).toBe(true)
  })

  it('answers 404 for an unknown slug', async () => {
    await request(app()).get('/seo/vacancy/no-existe').expect(404)
  })
})

describe('GET /seo/sitemap', () => {
  it('lists every vacancy and the skills that still have open ones', async () => {
    posts.rows = [
      post({ slug: 'nueva', skills: ['python'], created_at: iso(2) }),
      post({ slug: 'vieja', skills: ['cobol'], created_at: iso(90) }),
    ]

    const res = await request(app()).get('/seo/sitemap').expect(200)

    expect(res.body.vacancies.map((v: { slug: string }) => v.slug)).toEqual(['nueva', 'vieja'])
    expect(res.body.skills.map((s: { name: string }) => s.name)).toEqual(['python'])
  })
})

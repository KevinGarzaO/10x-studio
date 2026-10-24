import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { jobPostingSchema, jsonLdString } from '@/lib/job-posting-schema'
import type { SeoVacancy } from '@/lib/seo'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import EmpleosPage from '@/app/(main)/empleos/page'
import SkillPage, { generateMetadata as skillMetadata } from '@/app/(main)/empleos/[skill]/page'
import VacancyLayout from '@/app/(main)/vacantes/[slug]/layout'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/empleos',
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

const vacancy = (patch: Partial<SeoVacancy> = {}): SeoVacancy => ({
  id: 'v1', slug: 'backend-engineer-1', title: 'Backend Engineer', company: 'Stripe', company_logo: 'https://cdn.test/stripe.png',
  location: 'Dublin', modalidad: 'Presencial', seniority_level: 'senior', role_category: 'backend', skills: ['python', 'aws'], budget: null,
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(), description: '<p>Build payment APIs.</p>', expired: false, ...patch,
})

describe('jobPostingSchema', () => {
  it('describes an on-site vacancy with its place, and never as remote work', () => {
    const schema = jobPostingSchema(vacancy())!

    expect(schema['@type']).toBe('JobPosting')
    expect(schema.title).toBe('Backend Engineer')
    expect(schema.jobLocation).toMatchObject({ address: { addressLocality: 'Dublin' } })
    expect(schema).not.toHaveProperty('jobLocationType')
    expect(schema).not.toHaveProperty('applicantLocationRequirements')
  })

  it('marks a remote vacancy as remote, by its modality or by its location', () => {
    expect(jobPostingSchema(vacancy({ modalidad: 'Remoto' }))!.jobLocationType).toBe('TELECOMMUTE')
    expect(jobPostingSchema(vacancy({ modalidad: null, location: 'Remoto' }))!.jobLocationType).toBe('TELECOMMUTE')
  })

  it('does not invent what it does not know: country, employment type, salary, direct apply', () => {
    const schema = jobPostingSchema(vacancy({ budget: 'USD 90k–120k' }))!

    for (const invented of ['baseSalary', 'employmentType', 'directApply', 'applicantLocationRequirements']) {
      expect(schema).not.toHaveProperty(invented)
    }
    expect(JSON.stringify(schema)).not.toMatch(/Latin America/i)
  })

  it('names the hiring organization with its logo, and does not pass the apply link off as the company site', () => {
    const org = jobPostingSchema(vacancy())!.hiringOrganization as Record<string, unknown>
    expect(org).toEqual({ '@type': 'Organization', name: 'Stripe', logo: 'https://cdn.test/stripe.png' })
  })

  it('is valid for 45 days from the day it was posted', () => {
    const schema = jobPostingSchema(vacancy({ created_at: '2026-10-01T00:00:00.000Z' }))!
    expect(schema.datePosted).toBe('2026-10-01T00:00:00.000Z')
    expect(schema.validThrough).toBe('2026-11-15T00:00:00.000Z')
  })

  it('gives nothing for an expired vacancy, or one missing what Google requires', () => {
    expect(jobPostingSchema(vacancy({ expired: true }))).toBeNull()
    expect(jobPostingSchema(vacancy({ description: null }))).toBeNull()
    expect(jobPostingSchema(vacancy({ company: null }))).toBeNull()
    expect(jobPostingSchema(vacancy({ created_at: 'no es una fecha' }))).toBeNull()
  })

  it('cannot close the script tag it is embedded in', () => {
    const text = jsonLdString({ description: '</script><script>alert(1)</script>' })
    expect(text).not.toContain('</script>')
    expect(JSON.parse(text).description).toBe('</script><script>alert(1)</script>')
  })
})

describe('robots', () => {
  it('lets search engines read the public site and keeps them out of the account screens', () => {
    const rules = robots()
    const rule = (Array.isArray(rules.rules) ? rules.rules[0] : rules.rules) as { allow: string; disallow: string[] }

    expect(rule.allow).toBe('/')
    for (const path of ['/api/', '/login', '/signup', '/onboarding', '/settings', '/saved', '/notifications']) {
      expect(rule.disallow).toContain(path)
    }
    expect(rules.sitemap).toBe('https://avotalent.app/sitemap.xml')
  })
})

describe('the pages and the sitemap read from the backend', () => {
  const calls: string[] = []

  function backend(overrides: Record<string, unknown> = {}) {
    const answers: Record<string, unknown> = {
      'skills': { skills: [{ name: 'python', label: 'Python', vacancies: 2 }, { name: 'react', label: 'React', vacancies: 1 }] },
      'skills/python': { skill: { name: 'python', label: 'Python' } },
      'skills/cobol': { skill: { name: 'cobol', label: 'COBOL' } },
      'vacancies': { vacancies: [vacancy(), vacancy({ id: 'v2', slug: 'otra', title: 'Data Engineer' })] },
      'sitemap': { skills: [{ name: 'python', lastModified: '2026-10-20T00:00:00Z' }], roles: [{ slug: 'ux-ui', lastModified: '2026-10-20T00:00:00Z' }], vacancies: [{ slug: 'backend-engineer-1', lastModified: '2026-10-21T00:00:00Z' }] },
      ...overrides,
    }
    global.fetch = vi.fn(async (url: string) => {
      calls.push(String(url))
      const path = String(url).split('/api/community/seo/')[1]
      const key = path.split('?')[0]
      const body = key in answers ? answers[key] : null
      return body === null ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => body }
    }) as unknown as typeof fetch
  }

  beforeEach(() => { calls.length = 0 })
  afterEach(() => { vi.unstubAllGlobals() })

  it('the sitemap lists the home, both directories, the roles and skills with vacancies and every vacancy', async () => {
    backend()
    const urls = (await sitemap()).map(entry => entry.url)

    expect(urls).toEqual([
      'https://avotalent.app',
      'https://avotalent.app/empleos',
      'https://avotalent.app/puestos',
      'https://avotalent.app/puestos/ux-ui',
      'https://avotalent.app/empleos/python',
      'https://avotalent.app/vacantes/backend-engineer-1',
    ])
  })

  it('the sitemap still answers when the backend is down', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const urls = (await sitemap()).map(entry => entry.url)
    expect(urls).toEqual(['https://avotalent.app', 'https://avotalent.app/empleos', 'https://avotalent.app/puestos'])
  })

  it('the directory lists skills and vacancies as plain links a crawler can follow', async () => {
    backend()
    const { container } = render(await EmpleosPage())

    expect(screen.getByRole('heading', { name: /empleos por skill/i })).toBeTruthy()
    expect(container.querySelector('a[href="/empleos/python"]')).toBeTruthy()
    expect(container.querySelector('a[href="/vacantes/backend-engineer-1"]')).toBeTruthy()
  })

  it('a skill page lists its vacancies, breadcrumbs included', async () => {
    backend()
    const { container } = render(await SkillPage({ params: Promise.resolve({ skill: 'python' }) }))

    expect(screen.getByRole('heading', { name: 'Vacantes de Python' })).toBeTruthy()
    expect(container.querySelector('a[href="/vacantes/backend-engineer-1"]')).toBeTruthy()
    const breadcrumb = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(breadcrumb['@type']).toBe('BreadcrumbList')
    expect(breadcrumb.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Inicio', 'Empleos', 'Python'])
    expect(calls.some(c => c.includes('vacancies?skill=python'))).toBe(true)
  })

  it('a skill that does not exist is a 404', async () => {
    backend()
    await expect(SkillPage({ params: Promise.resolve({ skill: 'no-existe' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('a skill with no open vacancies stays out of the search index', async () => {
    backend({ 'vacancies': { vacancies: [] } })
    const meta = await skillMetadata({ params: Promise.resolve({ skill: 'cobol' }) })
    expect(meta.robots).toEqual({ index: false, follow: true })

    backend()
    const withVacancies = await skillMetadata({ params: Promise.resolve({ skill: 'python' }) })
    expect(withVacancies.robots).toBeUndefined()
    expect(withVacancies.alternates?.canonical).toBe('https://avotalent.app/empleos/python')
    expect(String(withVacancies.description)).toContain('2 vacantes abiertas')
  })

  it('a skill page does not promise things the data does not back up', async () => {
    backend()
    const meta = await skillMetadata({ params: Promise.resolve({ skill: 'python' }) })
    expect(`${meta.title} ${meta.description}`).not.toMatch(/salario|USD|verificad|remot/i)
  })

  it('the vacancy page carries its JobPosting data', async () => {
    backend({ 'vacancy/backend-engineer-1': { vacancy: vacancy() } })
    const { container } = render(await VacancyLayout({ children: <p>contenido</p>, params: Promise.resolve({ slug: 'backend-engineer-1' }) }))

    const schema = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(schema['@type']).toBe('JobPosting')
    expect(schema.title).toBe('Backend Engineer')
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('an expired vacancy has no JobPosting data, but its page still shows', async () => {
    backend({ 'vacancy/viejo': { vacancy: vacancy({ expired: true }) } })
    const { container } = render(await VacancyLayout({ children: <p>contenido</p>, params: Promise.resolve({ slug: 'viejo' }) }))

    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull()
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('a vacancy the backend cannot find still shows its page, without data', async () => {
    backend()
    const { container } = render(await VacancyLayout({ children: <p>contenido</p>, params: Promise.resolve({ slug: 'nada' }) }))
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull()
    await waitFor(() => expect(screen.getByText('contenido')).toBeTruthy())
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateMetadata } from '@/app/(main)/vacantes/[slug]/layout'

const respond = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) })))

afterEach(() => { vi.unstubAllGlobals() })

describe('generateMetadata of a vacancy', () => {
  it('gives the link card a title, a description with the key facts, and the company logo', async () => {
    respond({
      title: 'Backend Engineer',
      company: 'Stripe',
      company_logo: 'https://cdn.test/stripe.png',
      role_category: 'backend',
      seniority_level: 'senior',
      location: 'Dublin',
      modalidad: 'Remoto',
      skills: ['python', 'aws'],
    })

    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'backend-engineer-1' }) })

    expect(meta.title).toBe('Backend Engineer — Stripe')
    expect(meta.description).toContain('Desarrollo Backend')
    expect(meta.description).toContain('Senior')
    expect(meta.description).toContain('Dublin')
    expect(meta.description).toContain('python, aws')
    expect(meta.description).toContain('Regístrate')
    expect(meta.openGraph).toMatchObject({ title: 'Backend Engineer — Stripe', images: ['https://cdn.test/stripe.png'] })
  })

  it('leaves out what the vacancy does not say', async () => {
    respond({ title: 'Analista', company: 'Acme', modalidad: 'No especificado', location: 'unknown', skills: [] })

    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'x' }) })

    expect(meta.description).not.toMatch(/no especificado|unknown|Skills:/i)
    expect(meta.openGraph).not.toHaveProperty('images')
  })

  it('falls back to the site defaults when the vacancy cannot be read', async () => {
    respond({}, false)
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'x' }) })).toEqual({})

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'x' }) })).toEqual({})
  })
})

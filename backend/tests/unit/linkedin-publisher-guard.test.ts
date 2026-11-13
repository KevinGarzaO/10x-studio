import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ recent: [] as unknown[], queries: [] as string[] }))

vi.mock('@avotalent/core/services/supabase.service', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {}
      let isRecentCheck = false
      for (const name of ['select', 'eq', 'not', 'gte', 'order', 'limit', 'in', 'lt', 'delete', 'insert']) {
        q[name] = (...args: unknown[]) => {
          if (table === 'linkedin_vacancy_posts' && name === 'in') isRecentCheck = true
          return q
        }
      }
      q.then = (resolve: any, reject: any) => {
        db.queries.push(`${table}${isRecentCheck ? ':recent' : ''}`)
        return Promise.resolve({ data: isRecentCheck ? db.recent : [], error: null }).then(resolve, reject)
      }
      return q
    },
  },
}))
vi.mock('@avotalent/core/services/linkedin.service', () => ({ LinkedInService: { publish: vi.fn() } }))

import { publishVacancyPost } from '@avotalent/core/services/linkedin/vacancy-publisher'

beforeEach(() => {
  db.recent = []
  db.queries = []
  process.env.COMMUNITY_APP_URL = 'https://avotalent.app'
})

describe('publishVacancyPost: no double firing', () => {
  it('does not publish when another post came out (or is being published) less than 90 minutes ago', async () => {
    db.recent = [{ id: 'x' }]
    const result = await publishVacancyPost()

    expect(result.status).toBe('skipped')
    expect(result.reason).toContain('90 minutos')
    // ni siquiera busca vacantes: se detiene antes
    expect(db.queries).toEqual(['linkedin_vacancy_posts:recent'])
  })

  it('goes on to look for a vacancy when nothing came out recently', async () => {
    const result = await publishVacancyPost()
    expect(result.reason).toContain('no hay vacantes disponibles')
  })

  it('a test on purpose (slug) or a preview (dryRun) is never blocked by the guard', async () => {
    db.recent = [{ id: 'x' }]
    expect((await publishVacancyPost({ slug: 'una-vacante' })).reason).toContain('no hay vacantes disponibles')
    expect((await publishVacancyPost({ dryRun: true })).reason).toContain('no hay vacantes disponibles')
    expect(db.queries).not.toContain('linkedin_vacancy_posts:recent')
  })
})

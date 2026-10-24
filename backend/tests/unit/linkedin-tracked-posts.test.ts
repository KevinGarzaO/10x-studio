import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import express from 'express'
import request from 'supertest'
import {
  slugify,
  makeUtmContent,
  trackedUrl,
  labelFromText,
  firstSiteUrl,
  monterreyWeekStart,
} from '../../services/linkedin/tracked-posts'

// El controller llama a supabase por dentro; el mock registra lo que entra y
// responde según la cola de escenarios de cada test.
const state = vi.hoisted(() => ({
  viewRows: [] as any[],
  viewError: null as any,
  insertQueue: [] as any[],
  inserted: [] as any[],
  deleteError: null as any,
  deletedIds: [] as any[],
  vacancyTitles: [] as any[],
  vacancyLogs: [] as any[],
  weeklyTrackedPosts: [] as any[],
  weeklyVisits: [] as any[],
  weeklySignups: [] as any[],
}))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = { table, _op: 'select', _id: null }
      q.select = () => q
      q.insert = (row: any) => { q._op = 'insert'; state.inserted.push(row); return q }
      q.delete = () => { q._op = 'delete'; return q }
      q.eq = (_col: string, val: any) => { q._id = val; return q }
      q.in = () => q
      q.order = () => q
      q.gte = () => q
      q.range = () => q
      q.single = () => q
      q.then = (resolve: any, reject: any) => {
        let result: any
        if (table === 'acquisition_by_post') {
          result = { data: state.viewRows, error: state.viewError }
        } else if (table === 'linkedin_tracked_posts' && q._op === 'select') {
          result = { data: state.weeklyTrackedPosts, error: null }
        } else if (table === 'landing_visits' && q._op === 'select') {
          result = { data: state.weeklyVisits, error: null }
        } else if (table === 'users' && q._op === 'select') {
          result = { data: state.weeklySignups, error: null }
        } else if (q._op === 'insert') {
          const error = state.insertQueue.length > 0 ? state.insertQueue.shift() : null
          result = { data: error ? null : state.inserted[state.inserted.length - 1], error }
        } else if (q._op === 'delete') {
          state.deletedIds.push(q._id)
          result = { data: null, error: state.deleteError }
        } else if (table === 'community_posts') {
          result = { data: state.vacancyTitles, error: null }
        } else if (table === 'linkedin_vacancy_posts') {
          result = { data: state.vacancyLogs, error: null }
        } else {
          result = { data: null, error: null }
        }
        return Promise.resolve(result).then(resolve, reject)
      }
      return q
    },
  },
}))

import linkedinRouter from '../../routes/linkedin'

const app = () => {
  const a = express()
  a.use(express.json())
  a.use('/api/linkedin', linkedinRouter)
  return a
}

beforeEach(() => {
  state.viewRows.length = 0
  state.viewError = null
  state.insertQueue.length = 0
  state.inserted.length = 0
  state.deleteError = null
  state.deletedIds.length = 0
  state.vacancyTitles.length = 0
  state.vacancyLogs.length = 0
  state.weeklyTrackedPosts.length = 0
  state.weeklyVisits.length = 0
  state.weeklySignups.length = 0
})

describe('monterreyWeekStart', () => {
  it('returns Monday at midnight in Monterrey, including the UTC offset', () => {
    expect(monterreyWeekStart(new Date('2026-11-04T18:30:00.000Z'))).toBe('2026-11-02T06:00:00.000Z')
  })

  it('uses the previous Monday before local midnight on Monday', () => {
    expect(monterreyWeekStart(new Date('2026-11-02T05:59:59.000Z'))).toBe('2026-10-26T06:00:00.000Z')
  })
})

describe('GET /registry?period=week', () => {
  it('returns this week totals and counts visits separately from unique visitors', async () => {
    state.weeklyTrackedPosts.push({
      id: 'post-id',
      utm_content: 'post-1',
      label: 'Post uno',
      destination_url: 'https://avotalent.io/',
      utm_campaign: 'linkedin-manual',
      published_at: new Date().toISOString(),
    })
    state.weeklyVisits.push(
      { visitor_id: 'visitor-1', content: 'post-1' },
      { visitor_id: 'visitor-1', content: 'post-1' },
      { visitor_id: 'visitor-2', content: 'post-1' },
    )
    state.weeklySignups.push(
      { signup_content: 'post-1' },
      { signup_content: null },
      { signup_content: 'post-1', is_test_account: true },
    )

    const res = await request(app()).get('/api/linkedin/registry?period=week')

    expect(res.status).toBe(200)
    expect(res.body.report).toMatchObject({
      totalSignups: 2,
      attributedSignups: 1,
      unattributedSignups: 1,
    })
    expect(res.body.posts[0]).toMatchObject({
      utm_content: 'post-1',
      visits: 3,
      visitors: 2,
      signups: 1,
      conversion_pct: 50,
    })
  })
})

describe('slugify', () => {
  it('deja solo minúsculas, números y guiones', () => {
    expect(slugify('5 Tips para Seniors!')).toBe('5-tips-para-seniors')
  })

  it('escribe las letras acentuadas sin acento', () => {
    expect(slugify('Ñú con acentó')).toBe('nu-con-acento')
  })

  it('no deja guiones sobrando en los bordes', () => {
    expect(slugify('  --Hola--  ')).toBe('hola')
  })
})

describe('makeUtmContent', () => {
  const day = new Date(2026, 9, 17)

  it('combina título, fecha y aleatorio', () => {
    expect(makeUtmContent('Hola Mundo', day, () => 'ab12')).toBe('hola-mundo-261017-ab12')
  })

  it('tiene un código aunque el título no dé texto', () => {
    expect(makeUtmContent('###', day, () => 'ab12')).toBe('post-261017-ab12')
  })

  it('separa dos publicaciones con el mismo título', () => {
    expect(makeUtmContent('Mismo', day, () => 'aaaa')).not.toBe(makeUtmContent('Mismo', day, () => 'bbbb'))
  })
})

describe('trackedUrl', () => {
  it('etiqueta el destino con los UTMs de LinkedIn y el código', () => {
    const url = new URL(trackedUrl('https://avotalent.io/vacantes/x', 'linkedin-manual', 'x-261017-ab12'))
    expect(url.origin + url.pathname).toBe('https://avotalent.io/vacantes/x')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'linkedin-manual',
      utm_content: 'x-261017-ab12',
    })
  })

  it('consulta lo que el destino ya traía', () => {
    const url = new URL(trackedUrl('https://avotalent.io/?ref=abc', 'c', 'k'))
    expect(url.searchParams.get('ref')).toBe('abc')
    expect(url.searchParams.get('utm_content')).toBe('k')
  })

  it('pisa un utm_content previo: manda el de esta publicación', () => {
    const url = new URL(trackedUrl('https://avotalent.io/?utm_content=viejo', 'c', 'nuevo'))
    expect(url.searchParams.get('utm_content')).toBe('nuevo')
  })

  it('usa la campaña por defecto si no viene', () => {
    const url = new URL(trackedUrl('https://avotalent.io/', '', 'k'))
    expect(url.searchParams.get('utm_campaign')).toBe('linkedin-manual')
  })

  it('se queja con una URL que no es URL', () => {
    expect(() => trackedUrl('no-es-url', 'c', 'k')).toThrow()
  })
})

describe('labelFromText', () => {
  it('usa el primer renglón con texto', () => {
    expect(labelFromText('\n  Hola mundo  \nSegunda línea')).toBe('Hola mundo')
  })

  it('corta lo largo', () => {
    const label = labelFromText('x'.repeat(80))
    expect(label.length).toBeLessThanOrEqual(60)
    expect(label.endsWith('…')).toBe(true)
  })

  it('queda vacío si no hay texto', () => {
    expect(labelFromText('   \n  ')).toBe('')
  })
})

describe('firstSiteUrl', () => {
  it('toma el primer link a nuestros sitios', () => {
    const text = 'Mira https://avotalent.io/vacantes/x y también https://twitter.com/otra'
    expect(firstSiteUrl(text)).toBe('https://avotalent.io/vacantes/x')
  })

  it('ignora links de otros sitios', () => {
    expect(firstSiteUrl('nada aquí https://example.com/x')).toBeNull()
  })
})

describe('la migración', () => {
  const sql = readFileSync(join(__dirname, '../../sql/linkedin-tracked-posts-migration.sql'), 'utf8').replace(/\r\n/g, '\n')

  it('crea la tabla cerrada a las llaves públicas', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS linkedin_tracked_posts')
    expect(sql).toContain('ALTER TABLE linkedin_tracked_posts ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(/REVOKE ALL ON linkedin_tracked_posts FROM anon, authenticated/)
  })

  it('le pone UNIQUE al código de cada publicación', () => {
    expect(sql).toMatch(/utm_content\s+TEXT NOT NULL UNIQUE/)
  })

  it('trae la vista del reporte sin exponerla', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW acquisition_by_post AS')
    expect(sql).toMatch(/REVOKE ALL ON acquisition_by_post FROM anon, authenticated/)
    expect(sql).toContain('FROM landing_visits')
    expect(sql).toContain('signup_content')
  })

  it('nombra content desde el primer SELECT del UNION', () => {
    expect(sql).toContain('SELECT utm_content AS content FROM linkedin_tracked_posts')
    expect(sql).toContain('SELECT signup_content AS content FROM users')
  })
})

describe('GET /api/linkedin/registry', () => {
  it('devuelve cada publicación con su link para copiar', async () => {
    state.viewRows = [{
      label: '5 tips para seniors',
      utm_content: '5-tips-261017-ab12',
      destination_url: 'https://avotalent.io/vacantes/x',
      utm_campaign: 'linkedin-manual',
      post_url: null,
      published_at: null,
      visitors: 40,
      visits: 52,
      signups: 4,
      conversion_pct: 10,
    }]

    const res = await request(app()).get('/api/linkedin/registry').expect(200)

    expect(res.body.posts).toHaveLength(1)
    expect(res.body.posts[0]).toMatchObject({ label: '5 tips para seniors', visitors: 40, signups: 4 })
    const url = new URL(res.body.posts[0].tracked_url)
    expect(url.searchParams.get('utm_content')).toBe('5-tips-261017-ab12')
    expect(url.searchParams.get('utm_source')).toBe('linkedin')
  })

  it('no inventa link para un código sin registro (vacante automática)', async () => {
    state.viewRows = [{ label: null, utm_content: 'backend-engineer-1', destination_url: null, visitors: 9, signups: 1 }]

    const res = await request(app()).get('/api/linkedin/registry').expect(200)

    expect(res.body.posts[0].tracked_url).toBeNull()
    expect(res.body.pendingMigration).toBeUndefined()
  })

  it('si falta la migración lo dice, sin error rojo', async () => {
    state.viewError = { message: 'relation "public.acquisition_by_post" does not exist' }

    const res = await request(app()).get('/api/linkedin/registry').expect(200)

    expect(res.body).toEqual({ success: true, posts: [], pendingMigration: true })
  })

  it('a las vacantes automáticas les agrega título, fecha y link al post', async () => {
    state.viewRows = [{
      label: null,
      utm_content: 'backend-engineer-abc12345',
      destination_url: null,
      post_url: null,
      published_at: null,
      visitors: 9,
      signups: 1,
    }]
    state.vacancyTitles = [{ slug: 'backend-engineer-abc12345', title: 'Backend Engineer' }]
    state.vacancyLogs = [{
      vacancy_slug: 'backend-engineer-abc12345',
      published_at: '2026-10-19T19:30:00.000Z',
      linkedin_post_id: 'urn:li:share:777888999',
    }]
    process.env.COMMUNITY_APP_URL = 'https://avotalent.vercel.app'

    try {
      const res = await request(app()).get('/api/linkedin/registry').expect(200)

      expect(res.body.posts[0]).toMatchObject({
        label: 'Backend Engineer',
        published_at: '2026-10-19T19:30:00.000Z',
        post_url: 'https://www.linkedin.com/feed/update/urn:li:share:777888999/',
        tracked_url: 'https://avotalent.vercel.app/vacantes/backend-engineer-abc12345?utm_source=linkedin&utm_medium=social&utm_campaign=vacante-auto&utm_content=backend-engineer-abc12345',
      })
    } finally {
      delete process.env.COMMUNITY_APP_URL
    }
  })

  it('envuelve el id del post sin urn en urn:li:share', async () => {
    state.viewRows = [{ label: null, utm_content: 'x-1', destination_url: null, visitors: 1, signups: 0 }]
    state.vacancyLogs = [{ vacancy_slug: 'x-1', published_at: '2026-10-20T14:30:00.000Z', linkedin_post_id: '456' }]

    const res = await request(app()).get('/api/linkedin/registry').expect(200)

    expect(res.body.posts[0].post_url).toBe('https://www.linkedin.com/feed/update/urn:li:share:456/')
  })

  it('no pisa los datos de una fila registrada a mano', async () => {
    state.viewRows = [{
      label: '5 tips',
      utm_content: '5-tips-261017-ab12',
      destination_url: 'https://avotalent.io/x',
      utm_campaign: 'linkedin-manual',
      post_url: 'https://www.linkedin.com/posts/manual',
      published_at: '2026-10-17T10:00:00.000Z',
      visitors: 3,
      signups: 1,
    }]
    state.vacancyTitles = [{ slug: '5-tips-261017-ab12', title: 'Otra cosa' }]
    state.vacancyLogs = [{ vacancy_slug: '5-tips-261017-ab12', published_at: '2026-10-01T00:00:00.000Z', linkedin_post_id: '999' }]

    const res = await request(app()).get('/api/linkedin/registry').expect(200)

    expect(res.body.posts[0]).toMatchObject({
      label: '5 tips',
      post_url: 'https://www.linkedin.com/posts/manual',
      published_at: '2026-10-17T10:00:00.000Z',
    })
  })
})

describe('POST /api/linkedin/registry', () => {
  it('pide el título', async () => {
    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ destinationUrl: 'https://avotalent.io/' })
      .expect(400)
    expect(res.body.error).toMatch(/título/)
  })

  it('pide una URL destino válida', async () => {
    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ label: 'Post', destinationUrl: 'no-es-url' })
      .expect(400)
    expect(res.body.error).toMatch(/URL destino/)
  })

  it('solo acepta http y https', async () => {
    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ label: 'Post', destinationUrl: 'ftp://avotalent.io/' })
      .expect(400)
    expect(res.body.error).toMatch(/http/)
  })

  it('registra la publicación y devuelve su link etiquetado', async () => {
    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ label: '5 Tips Seniors', destinationUrl: 'https://avotalent.io/blog/x?ref=li' })
      .expect(201)

    expect(res.body.post).toMatchObject({
      label: '5 Tips Seniors',
      destination_url: 'https://avotalent.io/blog/x?ref=li',
      utm_campaign: 'linkedin-manual',
      source: 'manual',
    })
    expect(res.body.post.utm_content).toMatch(/^5-tips-seniors-\d{6}-[a-z0-9]{4}$/)

    const url = new URL(res.body.post.tracked_url)
    expect(url.searchParams.get('ref')).toBe('li')
    expect(url.searchParams.get('utm_content')).toBe(res.body.post.utm_content)
  })

  it('guarda la campaña y la fecha si vienen', async () => {
    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({
        label: 'Lanzamiento',
        destinationUrl: 'https://avotalent.io/',
        campaign: 'release_2',
        postUrl: 'https://www.linkedin.com/posts/x',
        publishedAt: '2026-10-17',
      })
      .expect(201)

    expect(res.body.post).toMatchObject({
      utm_campaign: 'release_2',
      post_url: 'https://www.linkedin.com/posts/x',
      source: 'manual',
    })
    expect(res.body.post.published_at).toMatch(/^2026-10-17/)
  })

  it('si el código chocara, prueba con otro en vez de fallar', async () => {
    state.insertQueue = [{ message: 'duplicate key value violates unique constraint "linkedin_tracked_posts_utm_content_key"' }, null]

    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ label: 'Post', destinationUrl: 'https://avotalent.io/' })
      .expect(201)

    expect(state.inserted).toHaveLength(2)
    expect(res.body.post.utm_content).toMatch(/^post-\d{6}-[a-z0-9]{4}$/)
  })

  it('si falta la migración lo dice con el nombre del archivo', async () => {
    state.insertQueue = [{ message: 'relation "public.linkedin_tracked_posts" does not exist' }]

    const res = await request(app())
      .post('/api/linkedin/registry')
      .send({ label: 'Post', destinationUrl: 'https://avotalent.io/' })
      .expect(500)

    expect(res.body.error).toContain('linkedin-tracked-posts-migration.sql')
  })
})

describe('DELETE /api/linkedin/registry/:id', () => {
  it('pide un id con forma de uuid', async () => {
    await request(app()).delete('/api/linkedin/registry/hola').expect(400)
  })

  it('borra la publicación', async () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const res = await request(app()).delete(`/api/linkedin/registry/${id}`).expect(200)

    expect(res.body.success).toBe(true)
    expect(state.deletedIds).toEqual([id])
  })

  it('si falta la migración lo dice con el nombre del archivo', async () => {
    state.deleteError = { message: 'relation "public.linkedin_tracked_posts" does not exist' }

    const res = await request(app())
      .delete('/api/linkedin/registry/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      .expect(500)

    expect(res.body.error).toContain('linkedin-tracked-posts-migration.sql')
  })
})

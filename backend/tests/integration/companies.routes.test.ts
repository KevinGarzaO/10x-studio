import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import companiesRouter from '../../src/routes/community/companies.routes'
import { getOrCreateCompanyUser, findFreeCompanyUsername } from '../../services/scraper/sync'

// Endpoint público: no hay auth que suplantar. Todo corre real contra Supabase.
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/companies', companiesRouter)
  return app
}

const stamp = Date.now().toString(36)
const collidingSlug = `t048acme${stamp}`
const createdUserIds: string[] = []

/** Crea un candidato cuyo username es justo el slug de una empresa. */
async function createCandidateNamed(username: string) {
  const { data, error } = await supabase
    .from('users')
    .insert({ username, display_name: 'Persona T048' })
    .select('id')
    .single()

  if (error) throw new Error(`no se pudo crear ${username}: ${error.message}`)
  createdUserIds.push(data!.id)
  return data!.id as string
}

beforeAll(async () => {
  await createCandidateNamed(collidingSlug)
})

afterAll(async () => {
  for (const id of createdUserIds) {
    await supabase.from('users').delete().eq('id', id)
  }
})

describe('getOrCreateCompanyUser (integration, T048)', () => {
  // El bug que esta feature arregla: antes buscaba por username, así que la
  // cuenta de la persona quedaba como autora de las vacantes de la empresa.
  it('never reuses a candidate account that happens to own the slug (FR-028)', async () => {
    const candidateId = createdUserIds[0]

    const companyId = await getOrCreateCompanyUser(collidingSlug, null)
    expect(companyId).toBeTruthy()
    expect(companyId).not.toBe(candidateId)
    createdUserIds.push(companyId!)

    const { data: company } = await supabase
      .from('users')
      .select('username, company_slug, account_type')
      .eq('id', companyId!)
      .single()

    expect(company!.account_type).toBe('company')
    expect(company!.company_slug).toBe(collidingSlug)
    // El username queda desambiguado, porque el natural ya lo usa la persona.
    expect(company!.username).toBe(`${collidingSlug}-empresa`)

    // La persona sigue siendo candidato y sin vacantes ajenas.
    const { data: person } = await supabase
      .from('users')
      .select('account_type, company_slug')
      .eq('id', candidateId)
      .single()
    expect(person!.account_type).toBe('candidate')
    expect(person!.company_slug).toBeNull()
  })

  it('reuses the same company account on a later sync (FR-029)', async () => {
    const again = await getOrCreateCompanyUser(collidingSlug, null)

    const { data: rows } = await supabase
      .from('users')
      .select('id')
      .eq('company_slug', collidingSlug)
      .eq('account_type', 'company')

    expect(rows).toHaveLength(1)
    expect(again).toBe(rows![0].id)
  })

  it('uses the plain slug when nobody owns it', async () => {
    const freeSlug = `t048libre${stamp}`
    const id = await getOrCreateCompanyUser(freeSlug, null)
    expect(id).toBeTruthy()
    createdUserIds.push(id!)

    const { data } = await supabase.from('users').select('username').eq('id', id!).single()
    expect(data!.username).toBe(freeSlug)
  })
})

describe('findFreeCompanyUsername (integration, T047)', () => {
  it('walks past every taken username', async () => {
    // El slug lo tiene la persona y `<slug>-empresa` la empresa creada arriba.
    expect(await findFreeCompanyUsername(collidingSlug)).toBe(`${collidingSlug}-empresa-2`)
  })
})

describe('GET /api/community/companies/:slug (integration, T048)', () => {
  it('returns the company for its slug', async () => {
    const res = await request(buildApp()).get(`/api/community/companies/${collidingSlug}`)

    expect(res.status).toBe(200)
    expect(res.body.user.company_slug).toBe(collidingSlug)
    expect(res.body.user.account_type).toBe('company')
    expect(Array.isArray(res.body.user.community_posts)).toBe(true)
  })

  it('returns 404 for a slug that only exists as a candidate username', async () => {
    const personOnly = `t048solopersona${stamp}`
    await createCandidateNamed(personOnly)

    const res = await request(buildApp()).get(`/api/community/companies/${personOnly}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Empresa no encontrada')
  })

  it('returns 404 for a slug nobody owns', async () => {
    const res = await request(buildApp()).get('/api/community/companies/no-existe-esta-empresa-t048')
    expect(res.status).toBe(404)
  })

  it('still works for the companies created before this feature', async () => {
    const res = await request(buildApp()).get('/api/community/companies/twilio')

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('twilio')
  })
})

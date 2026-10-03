import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import claimsRouter from '../../src/routes/community/company-claims.routes'
import { removeClaimFiles } from '../../services/claim-documents'

// Solo se suplanta "quién es este usuario". El schema compartido, los índices
// únicos, los CHECK y el bucket privado corren de verdad.
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-user-id']
    next()
  },
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/company-claims', claimsRouter)
  return app
}

const stamp = Date.now().toString(36)
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK'
const docs = [
  { kind: 'existence', fileName: 'acta.pdf', dataUrl: PDF },
  { kind: 'identity', fileName: 'ine.pdf', dataUrl: PDF },
]

const createdUserIds: string[] = []
const createdClaimIds: string[] = []
let claimantId: string
let otherClaimantId: string
let companyId: string
let claimedCompanyId: string

async function createUser(username: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase
    .from('users')
    .insert({ username, display_name: username, ...extra })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo crear ${username}: ${error.message}`)
  createdUserIds.push(data!.id)
  return data!.id as string
}

function body(extra: Record<string, unknown> = {}) {
  return { companyName: `Claims Test ${stamp}`, rfc: 'CTE010203XY1', documents: docs, ...extra }
}

beforeAll(async () => {
  claimantId = await createUser(`claims-cand-${stamp}`)
  otherClaimantId = await createUser(`claims-cand2-${stamp}`)
  // Dos empresas del scraper: una libre y otra que ya tiene dueño.
  companyId = await createUser(`claims-empresa-${stamp}`, {
    account_type: 'company',
    company_slug: `claims-empresa-${stamp}`,
    is_scraper_profile: true,
  })
  claimedCompanyId = await createUser(`claims-tomada-${stamp}`, {
    account_type: 'company',
    company_slug: `claims-tomada-${stamp}`,
    is_scraper_profile: true,
    claimed_by: otherClaimantId,
  })
})

afterAll(async () => {
  // Primero los archivos del bucket: SQL no los puede borrar.
  if (createdClaimIds.length) {
    const { data: files } = await supabase
      .from('company_claim_documents')
      .select('storage_path')
      .in('claim_id', createdClaimIds)
    const paths = (files || []).map(f => f.storage_path).filter(Boolean) as string[]
    if (paths.length) await removeClaimFiles(paths)
  }

  await supabase.from('company_claims').delete().in('claimant_id', [claimantId, otherClaimantId])
  for (const id of createdUserIds) {
    await supabase.from('users').delete().eq('id', id)
  }
})

describe('POST /api/community/company-claims', () => {
  it('crea el reclamo, guarda los documentos y no expone ningún archivo', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', claimantId)
      .send(body({ companyUserId: companyId, companySize: '11-50', industry: 'Fintech' }))

    expect(res.status).toBe(201)
    createdClaimIds.push(res.body.claim.id)

    expect(res.body.claim.status).toBe('pending')
    expect(res.body.claim.documents.map((d: any) => d.kind).sort()).toEqual(['existence', 'identity'])
    // Ni rutas del bucket ni URLs: solo el tipo y el nombre del archivo.
    expect(JSON.stringify(res.body)).not.toContain('company-docs')
    expect(JSON.stringify(res.body)).not.toContain('storage_path')
    expect(JSON.stringify(res.body)).not.toMatch(/https?:\/\/[^"]*supabase/)

    // Los archivos sí quedaron en el bucket privado.
    const { data: stored } = await supabase
      .from('company_claim_documents')
      .select('storage_path, purged_at')
      .eq('claim_id', res.body.claim.id)
    expect(stored).toHaveLength(2)
    for (const row of stored || []) {
      expect(row.storage_path).toBeTruthy()
      expect(row.purged_at).toBeNull()
    }
  })

  it('la cuenta sigue siendo de candidato mientras el reclamo está pendiente', async () => {
    const { data } = await supabase
      .from('users')
      .select('account_type, company_id')
      .eq('id', claimantId)
      .single()
    expect(data!.account_type).toBe('candidate')
    expect(data!.company_id).toBeNull()
  })

  it('no deja un segundo reclamo abierto a la misma persona', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', claimantId)
      .send(body())

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('claim_in_progress')
  })

  it('rechaza reclamar una empresa que ya tiene dueño', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', otherClaimantId)
      .send(body({ companyUserId: claimedCompanyId }))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('company_already_claimed')
  })

  it('rechaza una empresa que no existe', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', otherClaimantId)
      .send(body({ companyUserId: '11111111-1111-4111-8111-111111111111' }))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('company_not_found')
  })

  it('rechaza un RFC inválido antes de tocar la base', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', otherClaimantId)
      .send(body({ rfc: 'NOESUNRFC' }))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
    expect(res.body.field).toBe('rfc')
  })

  it('rechaza un reclamo sin la identificación del solicitante', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', otherClaimantId)
      .send(body({ documents: [docs[0]] }))

    expect(res.status).toBe(400)
    expect(res.body.field).toBe('documents')
  })

  it('rechaza un archivo de un tipo que no aceptamos, y no deja el reclamo a medias', async () => {
    const res = await request(buildApp())
      .post('/api/community/company-claims')
      .set('x-test-user-id', otherClaimantId)
      .send(body({ documents: [{ ...docs[0], dataUrl: 'data:application/zip;base64,AAA' }, docs[1]] }))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('unsupported_type')

    const { data: leftovers } = await supabase
      .from('company_claims')
      .select('id')
      .eq('claimant_id', otherClaimantId)
    expect(leftovers).toHaveLength(0)
  })
})

describe('GET /api/community/company-claims/mine', () => {
  it('devuelve el reclamo propio con sus tipos de documento', async () => {
    const res = await request(buildApp())
      .get('/api/community/company-claims/mine')
      .set('x-test-user-id', claimantId)

    expect(res.status).toBe(200)
    expect(res.body.claim.companyName).toBe(`Claims Test ${stamp}`)
    expect(res.body.claim.documents).toHaveLength(2)
    expect(JSON.stringify(res.body)).not.toContain('company-docs')
  })

  it('no filtra el reclamo de otra persona', async () => {
    const res = await request(buildApp())
      .get('/api/community/company-claims/mine')
      .set('x-test-user-id', otherClaimantId)

    expect(res.status).toBe(200)
    expect(res.body.claim).toBeNull()
  })
})

describe('GET /api/community/company-claims/claimable', () => {
  it('lista solo empresas sin dueño', async () => {
    const res = await request(buildApp())
      .get(`/api/community/company-claims/claimable?q=claims-empresa-${stamp}`)
      .set('x-test-user-id', claimantId)

    expect(res.status).toBe(200)
    expect(res.body.companies.map((c: any) => c.id)).toContain(companyId)
  })

  it('oculta las empresas ya reclamadas', async () => {
    const res = await request(buildApp())
      .get(`/api/community/company-claims/claimable?q=claims-tomada-${stamp}`)
      .set('x-test-user-id', claimantId)

    expect(res.body.companies).toHaveLength(0)
  })

  it('no busca con menos de dos letras', async () => {
    const res = await request(buildApp())
      .get('/api/community/company-claims/claimable?q=a')
      .set('x-test-user-id', claimantId)

    expect(res.body.companies).toHaveLength(0)
  })
})

// Lo que garantiza la base aunque alguien escriba directo en SQL.
describe('candados de la base', () => {
  it('no acepta dos reclamos pendientes del mismo usuario', async () => {
    const { error } = await supabase.from('company_claims').insert({
      claimant_id: claimantId,
      company_name: 'Otro intento',
      rfc: 'OTR010203XY1',
    })
    expect(error?.code).toBe('23505')
  })

  it('no acepta dos reclamos vivos sobre la misma empresa', async () => {
    const { error } = await supabase.from('company_claims').insert({
      claimant_id: otherClaimantId,
      company_user_id: companyId,
      company_name: 'Empresa ya reclamada',
      rfc: 'EYR010203XY1',
    })
    expect(error?.code).toBe('23505')
  })

  it('no acepta un RFC con formato inválido', async () => {
    const { error } = await supabase.from('company_claims').insert({
      claimant_id: otherClaimantId,
      company_name: 'RFC malo',
      rfc: 'no-es-rfc',
    })
    expect(error).not.toBeNull()
  })

  it('no acepta un rechazo sin motivo', async () => {
    const { error } = await supabase.from('company_claims').insert({
      claimant_id: otherClaimantId,
      company_name: 'Sin motivo',
      rfc: 'SMO010203XY1',
      status: 'rejected',
    })
    expect(error).not.toBeNull()
  })

  it('un documento sin archivo tiene que estar marcado como borrado', async () => {
    const { error } = await supabase.from('company_claim_documents').insert({
      claim_id: createdClaimIds[0],
      kind: 'representation',
      storage_path: null,
      file_name: 'poder.pdf',
    })
    expect(error).not.toBeNull()
  })
})

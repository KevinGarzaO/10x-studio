import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { MAX_PENDING_PROPOSALS } from '@avocado/schemas'
import { supabase } from '../../services/supabase.service'
import skillProposalsRouter from '../../src/routes/community/skill-proposals.routes'

// Solo se suplanta "quién es este usuario". El resolvedor, el catálogo, los
// CHECK y el UNIQUE corren reales contra Supabase.
vi.mock('../../middleware/community-auth.middleware', () => ({
  communityAuthMiddleware: (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user-id']
    if (!id) return res.status(401).json({ error: 'unauthorized' })
    req.userId = id
    next()
  },
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/skill-proposals', skillProposalsRouter)
  return app
}

const stamp = Date.now().toString(36)
const candidateUsername = `t029-cand-${stamp}`
const otherUsername = `t029-otro-${stamp}`
const companyUsername = `t029-empresa-${stamp}`

let candidateId: string
let otherId: string
let companyId: string
let superadminId: string

const createdKeys: string[] = []

/** Toda propuesta que el test toque se borra por clave, con sus interesados. */
async function deleteProposalsByKeyPrefix(prefix: string) {
  const { data } = await supabase.from('skill_proposals').select('id, normalized_key')
  for (const row of data || []) {
    if ((row.normalized_key as string).startsWith(prefix)) {
      await supabase.from('skill_proposal_supporters').delete().eq('proposal_id', row.id)
      await supabase.from('skill_proposals').delete().eq('id', row.id)
    }
  }
}

beforeAll(async () => {
  const insert = async (username: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase
      .from('users')
      .insert({ username, display_name: username, ...extra })
      .select('id')
      .single()
    if (error) throw new Error(`no se pudo crear ${username}: ${error.message}`)
    return data!.id as string
  }

  candidateId = await insert(candidateUsername)
  otherId = await insert(otherUsername)
  companyId = await insert(companyUsername, {
    account_type: 'company',
    company_slug: companyUsername,
    is_scraper_profile: true,
    scraper_source: 'company',
  })

  const { data: superadmin } = await supabase
    .from('users')
    .select('id')
    .eq('is_superadmin', true)
    .limit(1)
    .single()
  superadminId = superadmin!.id
})

afterAll(async () => {
  await deleteProposalsByKeyPrefix('t029')
  for (const id of [candidateId, otherId, companyId]) {
    await supabase.from('skill_proposal_supporters').delete().eq('user_id', id)
    await supabase.from('users').delete().eq('id', id)
  }
})

beforeEach(async () => {
  await deleteProposalsByKeyPrefix('t029')
  createdKeys.length = 0
})

function propose(userId: string, text: string) {
  return request(buildApp())
    .post('/api/community/skill-proposals')
    .set('x-test-user-id', userId)
    .send({ text })
}

describe('POST /api/community/skill-proposals (integration, T029)', () => {
  it('resolves text that is already an approved skill, without creating anything', async () => {
    const res = await propose(candidateId, 'React')

    expect(res.status).toBe(200)
    expect(res.body.outcome).toBe('resolved')
    expect(res.body.skill).toEqual({ name: 'react', label: 'React' })
  })

  // FR-013: la variante conocida se resuelve sola, no genera propuesta.
  it('resolves a known alias to its skill', async () => {
    const res = await propose(candidateId, 'React.js')

    expect(res.status).toBe(200)
    expect(res.body.outcome).toBe('resolved')
    expect(res.body.skill.name).toBe('react')
  })

  it('creates a pending proposal for a skill that does not exist', async () => {
    const res = await propose(candidateId, `T029 Nuevo ${stamp}`)

    expect(res.status).toBe(201)
    expect(res.body.outcome).toBe('created')
    expect(res.body.proposal.status).toBe('pending')
    expect(res.body.proposal.skill).toBeNull()
  })

  // FR-017: no se duplica; el segundo queda como interesado.
  it('joins an existing pending proposal instead of duplicating it', async () => {
    const text = `T029 Compartido ${stamp}`
    const first = await propose(candidateId, text)
    expect(first.status).toBe(201)

    const second = await propose(otherId, text)
    expect(second.status).toBe(200)
    expect(second.body.outcome).toBe('joined')
    expect(second.body.proposal.id).toBe(first.body.proposal.id)

    const { count } = await supabase
      .from('skill_proposal_supporters')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', first.body.proposal.id)
    expect(count).toBe(2)
  })

  it('is idempotent when the same person proposes it twice', async () => {
    const text = `T029 Repetido ${stamp}`
    const first = await propose(candidateId, text)
    const again = await propose(candidateId, text)

    expect(again.status).toBe(200)
    expect(again.body.outcome).toBe('joined')

    const { count } = await supabase
      .from('skill_proposal_supporters')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', first.body.proposal.id)
    expect(count).toBe(1)
  })

  it('reports a rejected skill with its reason instead of reproposing it', async () => {
    const text = `T029 Rechazado ${stamp}`
    const created = await propose(candidateId, text)

    const { error } = await supabase.rpc('reject_skill_proposal', {
      p_proposal_id: created.body.proposal.id,
      p_reason: 'No es un skill técnico',
      p_reviewed_by: superadminId,
    })
    expect(error).toBeNull()

    const again = await propose(otherId, text)
    expect(again.status).toBe(409)
    expect(again.body.error).toBe('skill_rejected')
    expect(again.body.reason).toBe('No es un skill técnico')
  })

  it('resolves to the skill once the proposal is approved', async () => {
    const text = `T029 Aprobado ${stamp}`
    const created = await propose(candidateId, text)

    const skillName = `t029-aprobado-${stamp}`
    const { error } = await supabase.rpc('approve_skill_proposal', {
      p_proposal_id: created.body.proposal.id,
      p_name: skillName,
      p_label: 'T029 Aprobado',
      p_reviewed_by: superadminId,
    })
    expect(error).toBeNull()

    try {
      const again = await propose(otherId, text)
      expect(again.status).toBe(200)
      expect(again.body.outcome).toBe('resolved')
      expect(again.body.skill.name).toBe(skillName)
    } finally {
      await deleteProposalsByKeyPrefix('t029')
      await supabase.from('skills').delete().eq('name', skillName)
    }
  })

  it('resolves to the target skill once the proposal is merged as an alias', async () => {
    const text = `T029 Unido ${stamp}`
    const created = await propose(candidateId, text)

    const { error } = await supabase.rpc('merge_skill_proposal', {
      p_proposal_id: created.body.proposal.id,
      p_skill_name: 'react',
      p_reviewed_by: superadminId,
    })
    expect(error).toBeNull()

    try {
      const again = await propose(otherId, text)
      expect(again.status).toBe(200)
      expect(again.body.outcome).toBe('resolved')
      expect(again.body.skill.name).toBe('react')
    } finally {
      const { data } = await supabase
        .from('skill_proposals')
        .select('normalized_key')
        .eq('id', created.body.proposal.id)
        .maybeSingle()
      if (data) await supabase.from('skill_aliases').delete().eq('alias_key', data.normalized_key)
    }
  })

  // FR-019: el límite aplica a crear, no a sumarse.
  it(`stops a candidate at ${MAX_PENDING_PROPOSALS} pending proposals`, async () => {
    for (let i = 0; i < MAX_PENDING_PROPOSALS; i++) {
      const res = await propose(candidateId, `T029 Limite ${stamp} ${i}`)
      expect(res.status).toBe(201)
    }

    const extra = await propose(candidateId, `T029 Limite ${stamp} extra`)
    expect(extra.status).toBe(409)
    expect(extra.body.error).toBe('proposal_limit')
    expect(extra.body.limit).toBe(MAX_PENDING_PROPOSALS)

    // Sumarse a una propuesta existente sigue permitido.
    const joined = await propose(candidateId, `T029 Limite ${stamp} 0`)
    expect(joined.status).toBe(200)
    expect(joined.body.outcome).toBe('joined')
  })

  it.each([['   '], [''], ['...']])('rejects unusable text %j', async (text) => {
    const res = await propose(candidateId, text)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
    expect(res.body.field).toBe('text')
  })

  it('rejects a company account with candidates_only (FR-008)', async () => {
    const res = await propose(companyId, `T029 Empresa ${stamp}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('candidates_only')
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp())
      .post('/api/community/skill-proposals')
      .send({ text: 'Rust' })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/community/skill-proposals/mine (integration, T029)', () => {
  it('lists the proposals the candidate is interested in, with their state', async () => {
    const mine = `T029 Mia ${stamp}`
    const theirs = `T029 Ajena ${stamp}`
    await propose(candidateId, mine)
    await propose(otherId, theirs)

    const res = await request(buildApp())
      .get('/api/community/skill-proposals/mine')
      .set('x-test-user-id', candidateId)

    expect(res.status).toBe(200)
    const texts = res.body.proposals.map((p: { text: string }) => p.text)
    expect(texts).toContain(mine)
    expect(texts).not.toContain(theirs)
    expect(res.body.proposals[0].status).toBe('pending')
  })

  it('shows the rejection reason once the superadmin decides (FR-018)', async () => {
    const created = await propose(candidateId, `T029 Con motivo ${stamp}`)
    await supabase.rpc('reject_skill_proposal', {
      p_proposal_id: created.body.proposal.id,
      p_reason: 'Ya existe como Node.js',
      p_reviewed_by: superadminId,
    })

    const res = await request(buildApp())
      .get('/api/community/skill-proposals/mine')
      .set('x-test-user-id', candidateId)

    const found = res.body.proposals.find(
      (p: { id: string }) => p.id === created.body.proposal.id,
    )
    expect(found.status).toBe('rejected')
    expect(found.rejectionReason).toBe('Ya existe como Node.js')
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(buildApp()).get('/api/community/skill-proposals/mine')
    expect(res.status).toBe(401)
  })
})

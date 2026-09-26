import { describe, expect, it, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { supabase } from '../../services/supabase.service'
import skillsRouter from '../../src/routes/community/skills.routes'

// Integración real contra Supabase: sin mocks. Este endpoint es público, así
// que tampoco hay que suplantar sesión.
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/community/skills', skillsRouter)
  return app
}

const PROPOSAL_TEXT = 'Skill de prueba T015'
const PROPOSAL_KEY = 'skilldepruebat015'
const createdProposalIds: string[] = []

afterAll(async () => {
  for (const id of createdProposalIds) {
    await supabase.from('skill_proposals').delete().eq('id', id)
  }
})

describe('GET /api/community/skills (integration, T015)', () => {
  it('returns the approved catalog without requiring a session', async () => {
    const res = await request(buildApp()).get('/api/community/skills')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.skills)).toBe(true)
    expect(res.body.skills.length).toBeGreaterThanOrEqual(37)
    expect(res.body.skills).toEqual(
      expect.arrayContaining([{ name: 'react', label: 'React' }]),
    )
  })

  it('returns the aliases so the frontend can resolve variants offline', async () => {
    const res = await request(buildApp()).get('/api/community/skills')

    expect(res.status).toBe(200)
    expect(res.body.aliases).toEqual(
      expect.arrayContaining([{ alias: 'reactjs', skillName: 'react' }]),
    )
    // Todo alias apunta a un skill que sí viene en el catálogo.
    const names = new Set(res.body.skills.map((s: { name: string }) => s.name))
    for (const alias of res.body.aliases) {
      expect(names.has(alias.skillName)).toBe(true)
    }
  })

  it('never exposes a pending proposal as if it were a catalog skill', async () => {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('account_type', 'candidate')
      .limit(1)
      .single()

    const { data: proposal, error } = await supabase
      .from('skill_proposals')
      .insert({
        normalized_key: PROPOSAL_KEY,
        proposed_text: PROPOSAL_TEXT,
        proposed_by: user!.id,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    createdProposalIds.push(proposal!.id)

    const res = await request(buildApp()).get('/api/community/skills')

    expect(res.status).toBe(200)
    const names = res.body.skills.map((s: { name: string }) => s.name)
    expect(names).not.toContain(PROPOSAL_KEY)
    const aliases = res.body.aliases.map((a: { alias: string }) => a.alias)
    expect(aliases).not.toContain(PROPOSAL_KEY)
  })
})

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { supabase } from '../../services/supabase.service'
import { getOrCreateCompanyUser, CLAIMED_COMPANY } from '../../services/scraper/sync'

// Una empresa registrada queda fuera del scraper (requerimiento 003, sección F):
// su dueño la administra, así que el scraper no le actualiza el perfil ni le
// publica vacantes, y tampoco las publica el bot en su lugar.
const stamp = Date.now().toString(36)
const claimedName = `Claimed Co ${stamp}`
const freeName = `Free Co ${stamp}`
const createdUserIds: string[] = []

async function createCompany(name: string, extra: Record<string, unknown> = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const { data, error } = await supabase
    .from('users')
    .insert({
      username: slug,
      company_slug: slug,
      account_type: 'company',
      display_name: name,
      is_scraper_profile: true,
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo crear ${name}: ${error.message}`)
  createdUserIds.push(data!.id)
  return data!.id as string
}

let ownerId: string
let claimedId: string
let freeId: string

beforeAll(async () => {
  const { data: owner, error } = await supabase
    .from('users')
    .insert({ username: `claimed-owner-${stamp}`, display_name: 'Dueño' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  ownerId = owner!.id
  createdUserIds.push(ownerId)

  claimedId = await createCompany(claimedName, { claimed_by: ownerId })
  freeId = await createCompany(freeName)
})

afterAll(async () => {
  for (const id of createdUserIds) {
    await supabase.from('users').delete().eq('id', id)
  }
})

describe('getOrCreateCompanyUser con empresas reclamadas', () => {
  it('avisa que la empresa está reclamada en vez de devolver su id', async () => {
    expect(await getOrCreateCompanyUser(claimedName, null)).toBe(CLAIMED_COMPANY)
  })

  it('no le toca el logo a una empresa reclamada', async () => {
    await getOrCreateCompanyUser(claimedName, 'https://example.com/logo.png')
    const { data } = await supabase.from('users').select('photo_url').eq('id', claimedId).single()
    expect(data!.photo_url).toBeNull()
  })

  it('sigue administrando las empresas sin dueño', async () => {
    expect(await getOrCreateCompanyUser(freeName, null)).toBe(freeId)
  })

  it('no crea una empresa duplicada cuando la original ya tiene dueño', async () => {
    await getOrCreateCompanyUser(claimedName, null)
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('display_name', claimedName)
      .eq('account_type', 'company')
    expect(data).toHaveLength(1)
  })
})

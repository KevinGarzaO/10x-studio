/**
 * Nivel 1 (DB) de la feature 003: verifica que la base de datos sostiene por sí
 * misma las reglas de la fundación de cuentas, sin pasar por ningún endpoint.
 *
 * Importa porque en esta feature **no hay pantalla ni operación de aplicación**
 * para cambiar el tipo de cuenta, el permiso de superadmin ni decidir
 * propuestas: esas decisiones se toman a mano en SQL, así que los candados
 * tienen que vivir en la propia base (FR-004, FR-005, FR-007, FR-020, FR-021).
 *
 * Usa la llave de servicio contra la base real, igual que los otros dos scripts
 * de bypass. Toda fila que crea se borra por id al terminar.
 *
 * Correr explícitamente:
 *   npx vitest run scripts/test-account-foundation-bypass.ts
 */
import { it, expect, afterAll } from 'vitest'
import { supabase } from '../services/supabase.service'
import { normalizeSkillKey } from '@avocado/schemas'

const createdUserIds: string[] = []
const createdProposalIds: string[] = []
const createdSkillNames: string[] = []
const createdAliasKeys: string[] = []

/** Crea un candidato de prueba directo en la DB (sin auth: no inicia sesión). */
async function createCandidate(suffix: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      username: `t003-${suffix}-${Date.now().toString(36)}`,
      display_name: `Prueba 003 ${suffix}`,
      ...extra,
    })
    .select('id, username, account_type, is_superadmin')
    .single()

  if (error) throw new Error(`no se pudo crear el usuario de prueba: ${error.message}`)
  createdUserIds.push(data.id)
  return data
}

afterAll(async () => {
  for (const id of createdProposalIds) {
    await supabase.from('skill_proposals').delete().eq('id', id)
  }
  for (const key of createdAliasKeys) {
    await supabase.from('skill_aliases').delete().eq('alias_key', key)
  }
  for (const id of createdUserIds) {
    await supabase.from('users').delete().eq('id', id)
  }
  for (const name of createdSkillNames) {
    await supabase.from('skills').delete().eq('name', name)
  }
})

it('crea cuentas nuevas como candidato y sin superadmin (FR-003, FR-030)', async () => {
  const user = await createCandidate('default')
  expect(user.account_type).toBe('candidate')
  expect(user.is_superadmin).toBe(false)
})

it('bloquea nacer con superadmin, aunque lo pida el INSERT (FR-030)', async () => {
  const { error } = await supabase
    .from('users')
    .insert({
      username: `t003-born-superadmin-${Date.now().toString(36)}`,
      display_name: 'Nace superadmin',
      is_superadmin: true,
      is_scraper_profile: true,
      scraper_source: 'company',
    })
    .select('id')
    .single()

  expect(error).not.toBeNull()
  expect(error!.message).toContain('privileged_change_blocked')
})

it('bloquea cambiar account_type con un UPDATE directo (FR-004)', async () => {
  const user = await createCandidate('type-change')

  const { error } = await supabase
    .from('users')
    .update({ account_type: 'company' })
    .eq('id', user.id)

  expect(error).not.toBeNull()
  expect(error!.message).toContain('privileged_change_blocked')

  const { data: after } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single()
  expect(after!.account_type).toBe('candidate')
})

it('bloquea otorgarse superadmin con un UPDATE directo (FR-005)', async () => {
  const user = await createCandidate('grant-superadmin')

  const { error } = await supabase.from('users').update({ is_superadmin: true }).eq('id', user.id)

  expect(error).not.toBeNull()
  expect(error!.message).toContain('privileged_change_blocked')
})

it('rechaza un skill que no está en el catálogo (FR-012)', async () => {
  const user = await createCandidate('bad-skill')

  const { error } = await supabase
    .from('users')
    .update({ skills: ['react', 'skill-inventado-003'] })
    .eq('id', user.id)

  expect(error).not.toBeNull()
  expect(error!.message).toContain('skill_not_in_catalog')
})

it('rechaza un skill repetido en el perfil (FR-012)', async () => {
  const user = await createCandidate('dup-skill')

  const { error } = await supabase
    .from('users')
    .update({ skills: ['react', 'react'] })
    .eq('id', user.id)

  expect(error).not.toBeNull()
  expect(error!.message).toContain('duplicate_skill')
})

it('acepta un perfil cuyos skills sí están aprobados', async () => {
  const user = await createCandidate('good-skill')

  const { error } = await supabase
    .from('users')
    .update({ skills: ['react', 'nodejs'] })
    .eq('id', user.id)

  expect(error).toBeNull()
})

it('impide vaciar un dato obligatorio ya capturado (FR-027)', async () => {
  const user = await createCandidate('clear-required', {
    photo_url: 'https://example.com/foto.png',
    title: 'Backend Developer',
    location: 'Monterrey, MX',
  })

  const photo = await supabase.from('users').update({ photo_url: null }).eq('id', user.id)
  expect(photo.error).not.toBeNull()
  expect(photo.error!.message).toContain('required_field_cleared')

  const title = await supabase.from('users').update({ title: '   ' }).eq('id', user.id)
  expect(title.error).not.toBeNull()
  expect(title.error!.message).toContain('required_field_cleared')

  // Cambiarlo por otro valor válido sí se permite.
  const ok = await supabase.from('users').update({ title: 'Frontend Developer' }).eq('id', user.id)
  expect(ok.error).toBeNull()
})

it('impide borrar o renombrar un skill en uso (FR-021)', async () => {
  const name = `t003-skill-en-uso-${Date.now().toString(36)}`
  const { error: createError } = await supabase.from('skills').insert({ name, label: 'En uso 003' })
  expect(createError).toBeNull()
  createdSkillNames.push(name)

  const user = await createCandidate('skill-holder')
  const assigned = await supabase.from('users').update({ skills: [name] }).eq('id', user.id)
  expect(assigned.error).toBeNull()

  const deleted = await supabase.from('skills').delete().eq('name', name)
  expect(deleted.error).not.toBeNull()
  expect(deleted.error!.message).toContain('skill_in_use')

  const renamed = await supabase.from('skills').update({ name: `${name}-x` }).eq('name', name)
  expect(renamed.error).not.toBeNull()
  expect(renamed.error!.message).toContain('skill_in_use')

  // Liberado el skill, ya se puede borrar.
  await supabase.from('users').update({ skills: ['react'] }).eq('id', user.id)
  const freed = await supabase.from('skills').delete().eq('name', name)
  expect(freed.error).toBeNull()
})

it('rechaza estados inválidos de una propuesta (FR-020)', async () => {
  const user = await createCandidate('proposal-owner')
  const key = `t003propuesta${Date.now().toString(36)}`

  const { data: proposal, error } = await supabase
    .from('skill_proposals')
    .insert({ normalized_key: key, proposed_text: 'Propuesta 003', proposed_by: user.id })
    .select('id, status')
    .single()

  expect(error).toBeNull()
  createdProposalIds.push(proposal!.id)
  expect(proposal!.status).toBe('pending')

  // Rechazar sin motivo.
  const noReason = await supabase
    .from('skill_proposals')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', proposal!.id)
  expect(noReason.error).not.toBeNull()

  // Aprobar sin skill resultante.
  const noSkill = await supabase
    .from('skill_proposals')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', proposal!.id)
  expect(noSkill.error).not.toBeNull()

  // Decidida pero sin revisor.
  const noReviewer = await supabase
    .from('skill_proposals')
    .update({ status: 'rejected', rejection_reason: 'No aplica' })
    .eq('id', proposal!.id)
  expect(noReviewer.error).not.toBeNull()

  // Texto con espacios sobrantes (FR-023).
  const untrimmed = await supabase
    .from('skill_proposals')
    .insert({
      normalized_key: `${key}b`,
      proposed_text: '  Con espacios  ',
      proposed_by: user.id,
    })
    .select('id')
    .single()
  expect(untrimmed.error).not.toBeNull()

  // Propuesta duplicada por clave normalizada (FR-017).
  const duplicate = await supabase
    .from('skill_proposals')
    .insert({ normalized_key: key, proposed_text: 'Propuesta 003 otra vez', proposed_by: user.id })
    .select('id')
    .single()
  expect(duplicate.error).not.toBeNull()
  expect(duplicate.error!.code).toBe('23505')
})

it('impide que un alias pertenezca a dos skills (FR-020)', async () => {
  const key = `t003alias${Date.now().toString(36)}`

  const first = await supabase
    .from('skill_aliases')
    .insert({ alias_key: key, skill_name: 'react' })
    .select('alias_key')
    .single()
  expect(first.error).toBeNull()
  createdAliasKeys.push(key)

  const second = await supabase
    .from('skill_aliases')
    .insert({ alias_key: key, skill_name: 'vue' })
    .select('alias_key')
    .single()
  expect(second.error).not.toBeNull()
  expect(second.error!.code).toBe('23505')

  // Un alias no puede apuntar a un skill que no existe (no aprobado).
  const orphan = await supabase
    .from('skill_aliases')
    .insert({ alias_key: `${key}x`, skill_name: 'skill-que-no-existe-003' })
    .select('alias_key')
    .single()
  expect(orphan.error).not.toBeNull()
})

it('normalize_skill_key en SQL coincide con normalizeSkillKey en TypeScript (R7)', async () => {
  const samples = [
    '  React.js ',
    'Node.js',
    'C++',
    'C#',
    'IA / Machine Learning',
    'Diseño',
    'Análisis de datos',
    'Google Ads',
    'adobe-suite',
    '.NET',
  ]

  for (const sample of samples) {
    const { data, error } = await supabase.rpc('normalize_skill_key', { p_text: sample })
    expect(error, `rpc falló para "${sample}"`).toBeNull()
    expect(data, `"${sample}"`).toBe(normalizeSkillKey(sample))
  }
})

import { normalizeSkillKey, MAX_PENDING_PROPOSALS } from '@avocado/schemas'
import { supabase } from '../../services/supabase.service'

export type ProposalStatus = 'pending' | 'approved' | 'merged' | 'rejected'

export interface ProposalRow {
  id: string
  proposed_text: string
  status: ProposalStatus
  resulting_skill_name: string | null
  rejection_reason: string | null
  proposed_at: string
  reviewed_at: string | null
}

export interface PresentedProposal {
  id: string
  text: string
  status: ProposalStatus
  skill: { name: string; label: string } | null
  rejectionReason: string | null
  proposedAt: string
  reviewedAt: string | null
}

export type ProposalOutcome =
  | { outcome: 'resolved'; skill: { name: string; label: string } }
  | { outcome: 'created'; proposal: PresentedProposal }
  | { outcome: 'joined'; proposal: PresentedProposal }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'limit_reached'; limit: number }

export type ProposalDecision =
  | { kind: 'resolve'; skillName: string }
  | { kind: 'reject'; reason: string }
  | { kind: 'join'; proposalId: string }
  | { kind: 'limit' }
  | { kind: 'create' }

/**
 * La decisión de qué hacer con un texto propuesto, sin tocar la base de datos.
 * Es el corazón de FR-016, FR-017 y FR-019, y por eso vive aparte: así se puede
 * probar cada rama sin simular Supabase.
 *
 * El orden importa y es el del contrato: un skill aprobado gana sobre cualquier
 * propuesta, una propuesta rechazada se informa sin crear otra, y el límite solo
 * aplica al crear una nueva.
 */
export function decideProposalOutcome(input: {
  approvedSkillName: string | null
  existing: Pick<ProposalRow, 'id' | 'status' | 'resulting_skill_name' | 'rejection_reason'> | null
  pendingCount: number
  maxPending: number
}): ProposalDecision {
  if (input.approvedSkillName) {
    return { kind: 'resolve', skillName: input.approvedSkillName }
  }

  const existing = input.existing
  if (existing) {
    if (existing.status === 'rejected') {
      return { kind: 'reject', reason: existing.rejection_reason || 'No fue aprobado' }
    }
    if (existing.status !== 'pending' && existing.resulting_skill_name) {
      return { kind: 'resolve', skillName: existing.resulting_skill_name }
    }
    return { kind: 'join', proposalId: existing.id }
  }

  if (input.pendingCount >= input.maxPending) {
    return { kind: 'limit' }
  }

  return { kind: 'create' }
}

/** Da forma de API a una fila de propuesta, con la etiqueta del skill resultante. */
export async function presentProposal(row: ProposalRow): Promise<PresentedProposal> {
  let skill: { name: string; label: string } | null = null

  if (row.resulting_skill_name) {
    const { data } = await supabase
      .from('skills')
      .select('name, label')
      .eq('name', row.resulting_skill_name)
      .maybeSingle()
    skill = data ? { name: data.name as string, label: data.label as string } : null
  }

  return {
    id: row.id,
    text: row.proposed_text,
    status: row.status,
    skill,
    rejectionReason: row.rejection_reason,
    proposedAt: row.proposed_at,
    reviewedAt: row.reviewed_at,
  }
}

/** El skill aprobado que corresponde a esta clave, por nombre, etiqueta o alias. */
async function resolveApprovedSkill(key: string) {
  const { data: skills, error } = await supabase.from('skills').select('name, label')
  if (error) throw error

  const direct = (skills || []).find(
    (skill) =>
      normalizeSkillKey(skill.name as string) === key ||
      normalizeSkillKey(skill.label as string) === key,
  )
  if (direct) return { name: direct.name as string, label: direct.label as string }

  const { data: alias } = await supabase
    .from('skill_aliases')
    .select('skill_name')
    .eq('alias_key', key)
    .maybeSingle()

  if (!alias) return null

  const target = (skills || []).find((skill) => skill.name === alias.skill_name)
  return target ? { name: target.name as string, label: target.label as string } : null
}

async function skillByName(name: string) {
  const { data } = await supabase.from('skills').select('name, label').eq('name', name).maybeSingle()
  return data ? { name: data.name as string, label: data.label as string } : null
}

const PROPOSAL_COLUMNS =
  'id, proposed_text, status, resulting_skill_name, rejection_reason, proposed_at, reviewed_at'

async function addSupporter(proposalId: string, userId: string) {
  // Sumarse dos veces es idempotente: la PK compuesta lo garantiza y el 23505
  // que devolvería significa "ya era interesado", no un error de la petición.
  await supabase
    .from('skill_proposal_supporters')
    .insert({ proposal_id: proposalId, user_id: userId })
    .then(undefined, () => undefined)
}

async function countPendingFor(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('skill_proposal_supporters')
    .select('proposal_id, skill_proposals!inner(status)')
    .eq('user_id', userId)
    .eq('skill_proposals.status', 'pending')

  if (error) throw error
  return (data || []).length
}

/**
 * Resuelve una propuesta de skill (FR-016, FR-017, FR-019). El orden es el del
 * contrato:
 *
 * 1. Si el texto ya corresponde a un skill aprobado (nombre, etiqueta o alias),
 *    no se crea nada: se devuelve ese skill.
 * 2. Si ya existe una propuesta con la misma clave normalizada, se responde
 *    según su estado, y si está pendiente el usuario queda como interesado.
 * 3. Si no existe, se crea, salvo que el usuario ya tenga el máximo pendientes.
 */
export async function proposeSkill(userId: string, text: string): Promise<ProposalOutcome> {
  const key = normalizeSkillKey(text)

  const approved = await resolveApprovedSkill(key)

  const { data: existing, error: existingError } = await supabase
    .from('skill_proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('normalized_key', key)
    .maybeSingle()

  if (existingError) throw existingError

  const existingRow = (existing as unknown as ProposalRow | null) ?? null

  const decision = decideProposalOutcome({
    approvedSkillName: approved?.name ?? null,
    existing: existingRow,
    // Contar pendientes solo hace falta si se va a crear una nueva.
    pendingCount:
      approved || existingRow ? 0 : await countPendingFor(userId),
    maxPending: MAX_PENDING_PROPOSALS,
  })

  if (decision.kind === 'resolve') {
    const skill = approved ?? (await skillByName(decision.skillName))
    if (skill) return { outcome: 'resolved', skill }
    // El skill resultante desapareció (lo borró el superadmin): se trata como
    // propuesta pendiente en lugar de mentirle al candidato.
  }

  if (decision.kind === 'reject') {
    return { outcome: 'rejected', reason: decision.reason }
  }

  if (decision.kind === 'limit') {
    return { outcome: 'limit_reached', limit: MAX_PENDING_PROPOSALS }
  }

  if (existingRow) {
    await addSupporter(existingRow.id, userId)
    return { outcome: 'joined', proposal: await presentProposal(existingRow) }
  }

  const { data: created, error: createError } = await supabase
    .from('skill_proposals')
    .insert({ normalized_key: key, proposed_text: text, proposed_by: userId })
    .select(PROPOSAL_COLUMNS)
    .single()

  if (createError) {
    // Carrera real: dos personas proponen lo mismo a la vez. El UNIQUE de
    // normalized_key decide, y quien pierde se suma a la propuesta ganadora.
    if (createError.code === '23505') {
      const { data: winner } = await supabase
        .from('skill_proposals')
        .select(PROPOSAL_COLUMNS)
        .eq('normalized_key', key)
        .single()

      if (winner) {
        const row = winner as unknown as ProposalRow
        await addSupporter(row.id, userId)
        return { outcome: 'joined', proposal: await presentProposal(row) }
      }
    }
    throw createError
  }

  const row = created as unknown as ProposalRow
  await addSupporter(row.id, userId)
  return { outcome: 'created', proposal: await presentProposal(row) }
}

/** Las propuestas en las que este usuario es interesado, recientes primero. */
export async function proposalsForUser(userId: string): Promise<PresentedProposal[]> {
  const { data, error } = await supabase
    .from('skill_proposal_supporters')
    .select(`proposal:skill_proposals!inner(${PROPOSAL_COLUMNS})`)
    .eq('user_id', userId)

  if (error) throw error

  const rows = (data || [])
    .map((entry: any) => entry.proposal as ProposalRow)
    .filter(Boolean)
    .sort((a, b) => new Date(b.proposed_at).getTime() - new Date(a.proposed_at).getTime())

  return Promise.all(rows.map(presentProposal))
}

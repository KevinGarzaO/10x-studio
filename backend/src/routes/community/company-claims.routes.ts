import { Router, Request, Response } from 'express'
import { companyClaimSchema, type ClaimDocumentKind } from '@avocado/schemas'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { uploadClaimDocument } from '../../../services/claim-documents'

const router = Router()

const CLAIM_COLUMNS =
  'id, company_name, rfc, company_user_id, website, description, company_size, industry, location, logo_url, status, rejection_reason, created_at, reviewed_at'

interface ClaimRow {
  id: string
  company_name: string
  rfc: string
  company_user_id: string | null
  website: string | null
  description: string | null
  company_size: string | null
  industry: string | null
  location: string | null
  logo_url: string | null
  status: string
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

function present(row: ClaimRow, documents: { kind: string; file_name: string }[] = []) {
  return {
    id: row.id,
    companyName: row.company_name,
    rfc: row.rfc,
    companyUserId: row.company_user_id,
    website: row.website,
    description: row.description,
    companySize: row.company_size,
    industry: row.industry,
    location: row.location,
    logoUrl: row.logo_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    // Los archivos no se exponen nunca: solo qué tipo de documento se entregó.
    documents: documents.map(doc => ({ kind: doc.kind, fileName: doc.file_name })),
  }
}

/**
 * GET /api/community/company-claims/claimable?q=
 *
 * AUTH: comunidad. Busca empresas que el scraper ya creó y que **nadie ha
 * reclamado**, para que quien se registra encuentre la suya en vez de crear un
 * duplicado.
 */
router.get('/claimable', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 2) return res.json({ companies: [] })

    const { data, error } = await supabase
      .from('users')
      .select('id, company_slug, display_name, username, photo_url')
      .eq('account_type', 'company')
      .is('claimed_by', null)
      .ilike('display_name', `%${q}%`)
      .limit(8)

    if (error) throw error

    res.json({
      companies: (data || []).map(row => ({
        id: row.id,
        slug: row.company_slug || row.username,
        name: row.display_name || row.username,
        logoUrl: row.photo_url,
      })),
    })
  } catch (error) {
    console.error('Community Search claimable companies error:', error)
    res.status(500).json({ error: 'Error al buscar empresas' })
  }
})

/**
 * GET /api/community/company-claims/mine
 *
 * AUTH: comunidad. El estado del reclamo de quien pregunta: en revisión,
 * aprobado o rechazado con su motivo (requerimiento 003, sección C.4).
 */
router.get('/mine', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('company_claims')
      .select(CLAIM_COLUMNS)
      .eq('claimant_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.json({ claim: null })

    const { data: documents } = await supabase
      .from('company_claim_documents')
      .select('kind, file_name')
      .eq('claim_id', (data as ClaimRow).id)

    res.json({ claim: present(data as ClaimRow, documents || []) })
  } catch (error) {
    console.error('Community Get my company claim error:', error)
    res.status(500).json({ error: 'Error al obtener tu solicitud' })
  }
})

/**
 * POST /api/community/company-claims
 *
 * AUTH: comunidad. Crea el reclamo con sus documentos.
 *
 * Mientras está pendiente, la persona NO actúa en nombre de la empresa: su
 * cuenta sigue siendo de candidato. El cambio de tipo ocurre al aprobarse, y
 * solo desde SQL (`approve_company_claim`), como manda la parte 1.
 */
router.post('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = companyClaimSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return res.status(400).json({
        error: 'validation_error',
        field: issue.path[0] ?? null,
        message: issue.message,
      })
    }

    const input = parsed.data

    // Una cuenta que ya es empresa no reclama otra.
    const { data: me } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', req.userId)
      .maybeSingle()

    if (me?.account_type === 'company') {
      return res.status(409).json({
        error: 'already_company',
        message: 'Tu cuenta ya pertenece a una empresa',
      })
    }

    // Un reclamo abierto a la vez.
    const { data: pending } = await supabase
      .from('company_claims')
      .select('id')
      .eq('claimant_id', req.userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pending) {
      return res.status(409).json({
        error: 'claim_in_progress',
        message: 'Ya tienes una solicitud en revisión',
      })
    }

    // La empresa que se reclama debe existir, ser empresa y no tener dueño.
    if (input.companyUserId) {
      const { data: company } = await supabase
        .from('users')
        .select('id, account_type, claimed_by')
        .eq('id', input.companyUserId)
        .maybeSingle()

      if (!company || company.account_type !== 'company') {
        return res.status(404).json({ error: 'company_not_found' })
      }
      if (company.claimed_by) {
        return res.status(409).json({
          error: 'company_already_claimed',
          message: 'Esa empresa ya tiene dueño. Pide acceso a un admin de la empresa.',
        })
      }
    }

    const { data: claim, error: insertError } = await supabase
      .from('company_claims')
      .insert({
        claimant_id: req.userId,
        company_user_id: input.companyUserId ?? null,
        company_name: input.companyName,
        rfc: input.rfc,
        website: input.website ?? null,
        description: input.description ?? null,
        company_size: input.companySize ?? null,
        industry: input.industry ?? null,
        location: input.location ?? null,
      })
      .select(CLAIM_COLUMNS)
      .single()

    if (insertError) {
      // Carrera: dos personas reclamando la misma empresa a la vez, o dos
      // pestañas del mismo usuario. El índice único decide.
      if (insertError.code === '23505') {
        return res.status(409).json({
          error: 'claim_in_progress',
          message: 'Ya existe una solicitud para esa empresa',
        })
      }
      throw insertError
    }

    const row = claim as ClaimRow
    const stored: { kind: ClaimDocumentKind; file_name: string }[] = []

    for (const doc of input.documents) {
      const uploaded = await uploadClaimDocument(doc.dataUrl, row.id, doc.kind, doc.fileName)

      if ('error' in uploaded) {
        // Sin documentos no hay nada que revisar: se deshace el reclamo en vez
        // de dejarlo a medias en la cola del superadmin.
        await supabase.from('company_claims').delete().eq('id', row.id)
        return res.status(400).json({
          error: uploaded.error,
          field: 'documents',
          message: 'No pudimos guardar uno de los documentos',
        })
      }

      await supabase.from('company_claim_documents').insert({
        claim_id: row.id,
        kind: doc.kind,
        storage_path: uploaded.storagePath,
        file_name: uploaded.fileName,
      })
      stored.push({ kind: doc.kind, file_name: uploaded.fileName })
    }

    res.status(201).json({ claim: present(row, stored) })
  } catch (error) {
    console.error('Community Create company claim error:', error)
    res.status(500).json({ error: 'Error al enviar tu solicitud' })
  }
})

export default router

import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { syncVacancyToCommunity } from '../../../services/scraper/sync'
import { scoreMatch } from '../../../services/matching/score'

const router = Router()

interface MatchedItem {
  sourceType: 'scraper' | 'community'
  id: string
  title: string
  company: string | null
  companyLogo: string | null
  roleCategory: string | null
  seniorityLevel: string | null
  skills: string[]
  url: string
  postDate: string | null
  /** Cuántos de tus skills pide la vacante. */
  matchingSkills: number
  /** Cuáles. */
  sharedSkills: string[]
  /** 0 a 100: qué tan bien encaja contigo (rol, skills, nivel y modalidad). */
  matchScore: number
  modalidad: string | null
}

function toSkillArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string')
  return []
}

// "Para ti" — las vacantes que mejor encajan con una persona, tanto las que ya están
// publicadas (community_posts) como las que siguen en el área de paso del scraper.
//
// Antes se pedía el mismo rol y el mismo nivel, exactos: se perdía quien busca algo
// cercano y se mostraban vacantes sin un solo skill en común. Ahora cada vacante
// reciente recibe un puntaje (services/matching/score.ts: rol, skills, nivel y
// modalidad) y se muestran las que de verdad encajan, las mejores primero.
const POOL_SIZE = 600

router.get('/for-you', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role_category, seniority, skills, work_modality')
      .eq('id', req.userId)
      .single()

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (!user.role_category) {
      return res.status(400).json({ error: 'Completa tu perfil (tu puesto) para ver tu feed personalizado' })
    }

    const candidate = {
      roleCategory: user.role_category as string,
      seniority: (user.seniority as string | null) ?? null,
      skills: ((user.skills || []) as string[]).map((skill) => skill.toLowerCase()),
      workModality: (user.work_modality as string | null) ?? null,
    }

    // Las más recientes de cada fuente: se puntúan en memoria, así no depende de que
    // la vacante tenga justo el mismo rol y nivel.
    const [{ data: scraperRows }, { data: communityRows }] = await Promise.all([
      supabase
        .from('scraper_posts')
        .select('id, text, company, company_logo, role_category, seniority_level, skills, url, post_date, created_at, work_modality')
        .eq('post_type', 'vacancy')
        .eq('is_spam', false)
        .order('post_date', { ascending: false })
        .limit(POOL_SIZE),
      supabase
        .from('community_posts')
        .select('id, title, company, company_logo, role_category, seniority_level, skills, slug, created_at, modalidad')
        .eq('type', 'job')
        .order('created_at', { ascending: false })
        .limit(POOL_SIZE),
    ])

    const items: MatchedItem[] = []

    const consider = (item: Omit<MatchedItem, 'matchingSkills' | 'sharedSkills' | 'matchScore'>, modality: string | null) => {
      const result = scoreMatch(candidate, {
        roleCategory: item.roleCategory,
        seniority: item.seniorityLevel,
        skills: item.skills.map((skill) => skill.toLowerCase()),
        workModality: modality,
      })
      if (!result.qualifies) return
      items.push({ ...item, matchingSkills: result.sharedSkills.length, sharedSkills: result.sharedSkills, matchScore: result.score })
    }

    for (const row of scraperRows || []) {
      consider(
        {
          sourceType: 'scraper',
          id: row.id,
          title: row.text?.split('\n')[0]?.replace(/^##\s*/, '').substring(0, 150) || 'Vacante sin título',
          company: row.company,
          companyLogo: row.company_logo,
          roleCategory: row.role_category,
          seniorityLevel: row.seniority_level,
          skills: toSkillArray(row.skills),
          url: row.url || '',
          postDate: row.post_date || row.created_at,
          modalidad: row.work_modality ?? null,
        },
        row.work_modality ?? null,
      )
    }

    for (const row of communityRows || []) {
      consider(
        {
          sourceType: 'community',
          id: row.id,
          title: row.title,
          company: row.company,
          companyLogo: row.company_logo,
          roleCategory: row.role_category,
          seniorityLevel: row.seniority_level,
          skills: toSkillArray(row.skills),
          url: `/vacantes/${row.slug || row.id}`,
          postDate: row.created_at,
          modalidad: row.modalidad ?? null,
        },
        row.modalidad ?? null,
      )
    }

    // Lo que mejor encaja primero; a igual puntaje, lo más reciente.
    const matched = items
    matched.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
      return new Date(b.postDate ?? 0).getTime() - new Date(a.postDate ?? 0).getTime()
    })

    const page = matched.slice(0, 50)

    // Snapshot side effect — every vacancy shown gets (or refreshes) a
    // history row, so it survives even if scraper_posts later sweeps it.
    // Selecting the upsert back gives each item its history row id/is_saved
    // state, so the frontend can offer a real "quitar guardado" toggle
    // without a second round-trip.
    let itemsWithHistory: (MatchedItem & { historyId: string; isSaved: boolean })[] = page.map(item => ({ ...item, historyId: '', isSaved: false }))
    if (page.length > 0) {
      const writes = page.map(item => ({
        user_id: req.userId,
        source_type: item.sourceType,
        source_id: item.id,
        title: item.title,
        company: item.company,
        company_logo: item.companyLogo,
        role_category: item.roleCategory,
        seniority_level: item.seniorityLevel,
        skills: item.skills,
        url: item.url,
        seen_at: new Date().toISOString(),
      }))
      const { data: historyRows } = await supabase
        .from('user_vacancy_history')
        .upsert(writes, { onConflict: 'user_id,source_type,source_id' })
        .select('id, source_type, source_id, is_saved')

      const historyByKey = new Map((historyRows || []).map((r: any) => [`${r.source_type}:${r.source_id}`, r]))
      itemsWithHistory = page.map(item => {
        const row = historyByKey.get(`${item.sourceType}:${item.id}`)
        return { ...item, historyId: row?.id ?? '', isSaved: !!row?.is_saved }
      })
    }

    res.json({ items: itemsWithHistory, total: matched.length })
  } catch (error) {
    console.error('Community for-you feed error:', error)
    res.status(500).json({ error: 'Error al obtener tu feed personalizado' })
  }
})

/**
 * POST /api/community/feed/for-you/open
 *
 * AUTH: comunidad. Devuelve la página de detalle de una vacante de "Para ti".
 *
 * Las vacantes del scraper que aparecen en "Para ti" viven en un área de paso
 * (`scraper_posts`) y no tienen página propia hasta que el sync las promueve a
 * `community_posts`, con un tope diario. Al abrirla desde aquí se promueve en el
 * momento, para que la persona caiga en el detalle y no en un sitio externo.
 *
 * `{ url: null }` significa que no hay detalle (la empresa ya tiene dueño, o la
 * vacante ya no existe): el frontend abre entonces el enlace original.
 */
router.post('/for-you/open', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sourceId = typeof req.body?.sourceId === 'string' ? req.body.sourceId : ''
    const externalUrl = typeof req.body?.url === 'string' ? req.body.url : ''
    if (!sourceId) return res.status(400).json({ error: 'sourceId es requerido' })

    let communityId: string | null = null

    const { data: staged } = await supabase
      .from('scraper_posts')
      .select('id, post_type, is_spam')
      .eq('id', sourceId)
      .maybeSingle()

    if (staged) {
      // Solo se promueve lo que el feed habría mostrado: una vacante real.
      if (staged.post_type !== 'vacancy' || staged.is_spam) return res.json({ url: null })
      communityId = await syncVacancyToCommunity(staged.id)
    } else if (externalUrl) {
      // Otra persona (o el sync) ya la promovió y el área de paso la borró: se
      // encuentra por el enlace original, que la vacante conserva como source_url.
      const { data: existing } = await supabase
        .from('community_posts')
        .select('id')
        .eq('source_url', externalUrl)
        .maybeSingle()
      communityId = existing?.id ?? null
    }

    if (!communityId) return res.json({ url: null })

    const { data: post } = await supabase
      .from('community_posts')
      .select('id, slug')
      .eq('id', communityId)
      .maybeSingle()

    res.json({ url: post ? `/vacantes/${post.slug || post.id}` : null })
  } catch (error) {
    console.error('Community for-you open error:', error)
    res.status(500).json({ error: 'No pudimos abrir la vacante' })
  }
})

export default router

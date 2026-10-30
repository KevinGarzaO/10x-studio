import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { syncVacancyToCommunity } from '../../../services/scraper/sync'
import { scoreForUser, type MatchedItem } from '../../../services/matching/compute'
import { readStoredMatches, storeMatches, TOP_MATCHES } from '../../../services/matching/refresh'
import { loadVacancyStats } from '../../../services/vacancies/popularity'

const router = Router()

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

    // Lo que ya se calculó de fondo (al guardar el perfil y cada 30 minutos). Solo si aún no hay nada se calcula
    // aquí, una vez; abrir el inicio nunca vuelve a puntuar todas las vacantes.
    let matched: MatchedItem[] | null = await readStoredMatches(req.userId as string)
    if (!matched) {
      matched = await scoreForUser(user as never)
      await storeMatches(req.userId as string, matched)
    }

    const page = matched.slice(0, TOP_MATCHES)

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

    // Cuánta gente abrió, guardó y se postuló a cada vacante (las de la comunidad; las del scraper aún no tienen página).
    const statsOf = await loadVacancyStats()
    const withStats = itemsWithHistory.map(item => {
      const slug = item.sourceType === 'community' ? /^\/vacantes\/([^/?#]+)/.exec(item.url ?? '')?.[1] ?? null : null
      return { ...item, stats: statsOf({ id: item.id, slug }) }
    })

    res.json({ items: withStats, total: matched.length })
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

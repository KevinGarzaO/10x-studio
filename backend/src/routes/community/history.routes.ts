import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.get('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let query = supabase
      .from('user_vacancy_history')
      .select('*')
      .eq('user_id', req.userId)
      .order('seen_at', { ascending: false })

    if (req.query.saved === 'true') query = query.eq('is_saved', true)

    const { data, error } = await query
    if (error) throw error

    res.json({ items: data || [] })
  } catch (error) {
    console.error('Community history list error:', error)
    res.status(500).json({ error: 'Error al obtener tu historial' })
  }
})

// Marks (or creates, if the vacancy hasn't been snapshotted yet — e.g.
// bookmarked straight from the main feed rather than via "Para ti") a
// history row as explicitly saved by the user.
router.post('/save', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sourceType, sourceId, title, company, companyLogo, roleCategory, seniorityLevel, skills, url } = req.body

    if (!sourceType || !sourceId) {
      return res.status(400).json({ error: 'sourceType y sourceId son requeridos' })
    }

    const { data, error } = await supabase
      .from('user_vacancy_history')
      .upsert(
        {
          user_id: req.userId,
          source_type: sourceType,
          source_id: sourceId,
          title: title ?? null,
          company: company ?? null,
          company_logo: companyLogo ?? null,
          role_category: roleCategory ?? null,
          seniority_level: seniorityLevel ?? null,
          skills: skills ?? [],
          url: url ?? null,
          is_saved: true,
          saved_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,source_type,source_id' }
      )
      .select()
      .single()

    if (error) throw error

    res.json({ item: data })
  } catch (error) {
    console.error('Community history save error:', error)
    res.status(500).json({ error: 'Error al guardar la vacante' })
  }
})

router.delete('/:id', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('user_vacancy_history')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)

    if (error) throw error

    res.json({ message: 'Eliminado de tu historial' })
  } catch (error) {
    console.error('Community history delete error:', error)
    res.status(500).json({ error: 'Error al eliminar del historial' })
  }
})

export default router

import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { loadPublicProfile, PROFILE_POSTS_SELECT } from './users.routes'

const router = Router()

/**
 * GET /api/community/companies/:slug — el perfil público de una empresa.
 *
 * AUTH: **público a propósito**, igual que GET /users/:username, del que
 * reutiliza la carga: el perfil de una empresa y sus vacantes son públicos.
 *
 * Busca por `company_slug` y `account_type = 'company'`, nunca por username.
 * Así una persona cuyo username coincide con el slug de una empresa no puede
 * aparecer como esa empresa, y la empresa conserva su URL pública aunque su
 * username haya quedado desambiguado (FR-028, FR-029).
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string

    const company = await loadPublicProfile(async () =>
      supabase
        .from('users')
        .select(`*, community_posts(${PROFILE_POSTS_SELECT})`)
        .eq('company_slug', slug)
        .eq('account_type', 'company')
        .single(),
    )

    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' })
    }

    res.json({ user: company })
  } catch (error) {
    console.error('Community Get company error:', error)
    res.status(500).json({ error: 'Error al obtener la empresa' })
  }
})

export default router

import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'

const router = Router()

/**
 * Las tarjetas que salen al pasar el cursor sobre el nombre o la foto de una persona o una empresa.
 *
 * AUTH: **públicas a propósito**, igual que los perfiles. Devuelven solo lo que el perfil público ya muestra (nada de
 * correo, teléfono ni datos privados) y son livianas: no traen publicaciones, a diferencia del perfil completo.
 */
const USER_COLUMNS = 'username, handle, display_name, name, photo_url, bio, location, role_category, seniority, created_at'

// Una vacante se considera abierta 45 días (igual que el resto del sitio).
const OPEN_DAYS = 45

router.get('/user/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username as string
    let { data: user } = await supabase.from('users').select(USER_COLUMNS).eq('username', username).maybeSingle()
    if (!user) ({ data: user } = await supabase.from('users').select(USER_COLUMNS).eq('handle', username).maybeSingle())
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    res.json({
      card: {
        kind: 'user',
        name: user.display_name || user.name || user.username || user.handle,
        username: user.username || user.handle,
        photo_url: user.photo_url ?? null,
        bio: user.bio ?? null,
        location: user.location ?? null,
        role_category: user.role_category ?? null,
        seniority: user.seniority ?? null,
        joined_at: user.created_at ?? null,
      },
    })
  } catch (error) {
    console.error('Community user card error:', error)
    res.status(500).json({ error: 'Error al obtener la tarjeta' })
  }
})

// Una empresa: por su slug. Si la empresa no tiene cuenta propia (las de las vacantes que trae el sistema), se arma con el
// nombre que manda el feed (?name=) y lo que se sabe de sus vacantes.
router.get('/company/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string
    const { data: company } = await supabase.from('users').select(`${USER_COLUMNS}, company_slug`).eq('company_slug', slug).eq('account_type', 'company').maybeSingle()

    const name = company?.display_name || company?.name || String(req.query.name ?? '').trim()
    if (!name) return res.status(404).json({ error: 'Empresa no encontrada' })

    const since = new Date(Date.now() - OPEN_DAYS * 86400000).toISOString()
    const { count } = await supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('type', 'job').eq('company', name).gte('created_at', since)

    res.json({
      card: {
        kind: 'company',
        name,
        slug,
        photo_url: company?.photo_url ?? null,
        bio: company?.bio ?? null,
        location: company?.location ?? null,
        open_vacancies: count ?? 0,
      },
    })
  } catch (error) {
    console.error('Community company card error:', error)
    res.status(500).json({ error: 'Error al obtener la tarjeta' })
  }
})

export default router

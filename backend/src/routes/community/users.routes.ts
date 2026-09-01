import { Router, Request, Response } from 'express'
import { supabase } from '../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../middleware/community-auth.middleware'

const router = Router()

router.get('/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username as string

    const { data: user, error } = await supabase
      .from('users')
      .select('*, community_posts(id, title, type, created_at, votes_count, comments_count)')
      .eq('username', username)
      .single()

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json({ user })
  } catch (error) {
    console.error('Community Get user error:', error)
    res.status(500).json({ error: 'Error al obtener el usuario' })
  }
})

router.put('/:username', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const username = req.params.username as string
    const { displayName, bio, avatarUrl, website, githubUrl } = req.body

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single()

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (user.id !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para editar este perfil' })
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        bio,
        avatar_url: avatarUrl,
        website,
        github_url: githubUrl,
      })
      .eq('username', username)
      .select()
      .single()

    if (error) throw error

    res.json({ user: updated })
  } catch (error) {
    console.error('Community Update user error:', error)
    res.status(500).json({ error: 'Error al actualizar el perfil' })
  }
})

export default router

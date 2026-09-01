import { Router, Response } from 'express'
import { supabase } from '../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../middleware/community-auth.middleware'

const router = Router()

router.get('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data: saved, error } = await supabase
      .from('community_saved_posts')
      .select('post_id, saved_at, post:community_posts(*, author:users(id, username, display_name, avatar_url), community_post_tags(tag:community_tags(name)))')
      .eq('user_id', req.userId)
      .order('saved_at', { ascending: false })

    if (error) throw error

    res.json({
      saved: (saved || []).map((s: any) => ({
        ...s.post,
        tags: s.post?.community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: s.post?.votes_count || 0,
        commentsCount: s.post?.comments_count || 0,
        savedAt: s.saved_at,
      })),
    })
  } catch (error) {
    console.error('Community Get saved error:', error)
    res.status(500).json({ error: 'Error al obtener los guardados' })
  }
})

router.post('/:postId', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.postId as string

    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .single()

    if (!post) {
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    const { data: existing } = await supabase
      .from('community_saved_posts')
      .select('user_id')
      .eq('user_id', req.userId)
      .eq('post_id', postId)
      .single()

    if (existing) {
      return res.status(409).json({ error: 'Ya guardaste esta publicación' })
    }

    await supabase.from('community_saved_posts').insert({
      user_id: req.userId,
      post_id: postId,
    })

    res.json({ message: 'Publicación guardada' })
  } catch (error) {
    console.error('Community Save error:', error)
    res.status(500).json({ error: 'Error al guardar la publicación' })
  }
})

router.delete('/:postId', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.postId as string

    await supabase
      .from('community_saved_posts')
      .delete()
      .eq('user_id', req.userId)
      .eq('post_id', postId)

    res.json({ message: 'Publicación removida de guardados' })
  } catch (error) {
    console.error('Community Unsave error:', error)
    res.status(500).json({ error: 'Error al remover de guardados' })
  }
})

export default router

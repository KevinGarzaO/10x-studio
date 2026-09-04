import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.get('/:postId/comments', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string

    const { data: comments, error } = await supabase
      .from('community_comments')
      .select('*, author:users(id, username, display_name, photo_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({ comments })
  } catch (error) {
    console.error('Community Get comments error:', error)
    res.status(500).json({ error: 'Error al obtener los comentarios' })
  }
})

router.post('/:postId/comments', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.postId as string
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'El contenido es requerido' })
    }

    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .single()

    if (!post) {
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    const { data: comment, error } = await supabase
      .from('community_comments')
      .insert({
        content,
        author_id: req.userId,
        post_id: postId,
      })
      .select('*, author:users(id, username, display_name, photo_url)')
      .single()

    if (error) throw error

    res.status(201).json({ comment })
  } catch (error) {
    console.error('Community Create comment error:', error)
    res.status(500).json({ error: 'Error al crear el comentario' })
  }
})

router.delete('/:commentId', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const commentId = req.params.commentId as string

    const { data: comment } = await supabase
      .from('community_comments')
      .select('author_id')
      .eq('id', commentId)
      .single()

    if (!comment) {
      return res.status(404).json({ error: 'Comentario no encontrado' })
    }

    if (comment.author_id !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' })
    }

    await supabase.from('community_comments').delete().eq('id', commentId)

    res.json({ message: 'Comentario eliminado' })
  } catch (error) {
    console.error('Community Delete comment error:', error)
    res.status(500).json({ error: 'Error al eliminar el comentario' })
  }
})

export default router

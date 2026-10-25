import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

// comments_count has no database trigger: it is recomputed from the real rows.
async function recountComments(postId: string): Promise<number> {
  const { count } = await supabase.from('community_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId)
  await supabase.from('community_posts').update({ comments_count: count ?? 0 }).eq('id', postId)
  return count ?? 0
}

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

    const commentsCount = await recountComments(postId)
    res.status(201).json({ comment, commentsCount })
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
      .select('author_id, post_id')
      .eq('id', commentId)
      .single()

    if (!comment) {
      return res.status(404).json({ error: 'Comentario no encontrado' })
    }

    const { data: viewer } = await supabase.from('users').select('is_superadmin').eq('id', req.userId).maybeSingle()
    if (comment.author_id !== req.userId && !viewer?.is_superadmin) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' })
    }

    await supabase.from('community_comments').delete().eq('id', commentId)
    const commentsCount = comment.post_id ? await recountComments(comment.post_id) : undefined

    res.json({ message: 'Comentario eliminado', commentsCount })
  } catch (error) {
    console.error('Community Delete comment error:', error)
    res.status(500).json({ error: 'Error al eliminar el comentario' })
  }
})

export default router

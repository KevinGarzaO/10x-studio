import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.get('/editorial', async (req: Request, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '20', 10)
    const days = parseInt((req.query.days as string) || '0', 10)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('content')
      .select('id, title, html_content, markdown_content, excerpt, image_url, slug, published_at, word_count', { count: 'exact' })
      .eq('content_type', 'blog_post')
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('published_at', since)
    }

    const { data: blogPosts, count, error } = await query.range(from, to)

    if (error) throw error

    const editorialPosts = (blogPosts || []).map((post: any) => ({
      id: post.id,
      title: post.title,
      content: post.excerpt || post.markdown_content?.substring(0, 500) || '',
      type: 'editorial',
      author: {
        id: null,
        username: 'avocado',
        display_name: 'Avocado Studio',
        avatar_url: null,
      },
      tags: [],
      votesCount: 0,
      commentsCount: 0,
      image_url: post.image_url,
      slug: post.slug,
      word_count: post.word_count,
      created_at: post.published_at,
    }))

    res.json({
      posts: editorialPosts,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Community Editorial posts error:', error)
    res.status(500).json({ error: 'Error al obtener los posts editoriales' })
  }
})

router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined
    const search = req.query.search as string | undefined
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '20', 10)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('community_posts')
      .select('*, author:users(id, username, display_name, photo_url), community_post_tags(tag:community_tags(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (type) query = query.eq('type', type)
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    const { data: posts, count, error } = await query

    if (error) throw error

    res.json({
      posts: (posts || []).map((p: any) => ({
        ...p,
        author: p.author,
        tags: p.community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: p.votes_count || 0,
        commentsCount: p.comments_count || 0,
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Community Get posts error:', error)
    res.status(500).json({ error: 'Error al obtener las publicaciones' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string

    const { data: post, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        author:users(id, username, display_name, photo_url, bio),
        community_post_tags(tag:community_tags(name)),
        community_comments(*, author:users(id, username, display_name, photo_url))
      `)
      .eq('id', id)
      .single()

    if (!error && post) {
      return res.json({
        ...post,
        author: post.author,
        tags: (post as any).community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: (post as any).votes_count || 0,
        commentsCount: (post as any).comments_count || 0,
      })
    }

    const { data: editorialPost, error: editorialError } = await supabase
      .from('content')
      .select('id, title, html_content, markdown_content, excerpt, image_url, slug, published_at, word_count')
      .eq('id', id)
      .single()

    if (!editorialError && editorialPost) {
      return res.json({
        id: editorialPost.id,
        title: editorialPost.title,
        content: editorialPost.html_content || editorialPost.markdown_content || '',
        excerpt: editorialPost.excerpt || '',
        type: 'editorial',
        author: {
          id: null,
          username: 'avocado',
          display_name: 'Avocado Studio',
          avatar_url: null,
        },
        tags: [],
        votesCount: 0,
        commentsCount: 0,
        image_url: editorialPost.image_url,
        slug: editorialPost.slug,
        word_count: editorialPost.word_count,
        created_at: editorialPost.published_at,
      })
    }

    return res.status(404).json({ error: 'Publicación no encontrada' })
  } catch (error) {
    console.error('Community Get post error:', error)
    res.status(500).json({ error: 'Error al obtener la publicación' })
  }
})

router.post('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, budget, modalidad, tags } = req.body

    if (!title || !content || !type) {
      return res.status(400).json({ error: 'Título, contenido y tipo son requeridos' })
    }

    const { data: post, error } = await supabase
      .from('community_posts')
      .insert({
        title,
        content,
        type,
        budget,
        modalidad,
        author_id: req.userId,
      })
      .select()
      .single()

    if (error) throw error

    if (tags?.length && post) {
      for (const tagName of tags) {
        const { data: existingTag } = await supabase
          .from('community_tags')
          .select('id')
          .eq('name', tagName.toLowerCase())
          .single()

        let tagId = existingTag?.id

        if (!tagId) {
          const { data: newTag } = await supabase
            .from('community_tags')
            .insert({ name: tagName.toLowerCase() })
            .select('id')
            .single()
          tagId = newTag?.id
        }

        if (tagId) {
          await supabase.from('community_post_tags').insert({
            post_id: post.id,
            tag_id: tagId,
          })
        }
      }
    }

    res.status(201).json({ post })
  } catch (error) {
    console.error('Community Create post error:', error)
    res.status(500).json({ error: 'Error al crear la publicación' })
  }
})

router.delete('/:id', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const { data: post } = await supabase
      .from('community_posts')
      .select('author_id')
      .eq('id', id)
      .single()

    if (!post) {
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    if (post.author_id !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta publicación' })
    }

    await supabase.from('community_posts').delete().eq('id', id)

    res.json({ message: 'Publicación eliminada' })
  } catch (error) {
    console.error('Community Delete post error:', error)
    res.status(500).json({ error: 'Error al eliminar la publicación' })
  }
})

router.post('/:id/vote', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const { data: existingVote } = await supabase
      .from('community_votes')
      .select('user_id')
      .eq('user_id', req.userId)
      .eq('post_id', id)
      .single()

    if (existingVote) {
      await supabase
        .from('community_votes')
        .delete()
        .eq('user_id', req.userId)
        .eq('post_id', id)
      return res.json({ voted: false })
    }

    await supabase.from('community_votes').insert({
      user_id: req.userId,
      post_id: id,
    })

    res.json({ voted: true })
  } catch (error) {
    console.error('Community Vote error:', error)
    res.status(500).json({ error: 'Error al votar' })
  }
})

export default router

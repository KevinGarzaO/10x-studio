import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { generateSlug } from '../../../services/slug'

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

    // Order: nativas first (is_scraper_post=false), then by votes, then by date
    query = query.order('is_scraper_post', { ascending: true })
    query = query.order('votes_count', { ascending: false })
    query = query.order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    // For job posts, fetch ALL to interleave by company
    const isJobFeed = type === 'job'
    if (!isJobFeed) {
      query = query.range(from, to)
    }

    const { data: posts, count, error } = await query

    if (error) throw error

    let mapped = (posts || []).map((p: any) => ({
        ...p,
        author: p.author,
        tags: p.community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: p.votes_count || 0,
        commentsCount: p.comments_count || 0,
      }))

    // Round-robin interleave by company for job feed
    if (isJobFeed && mapped.length > 0) {
      const companyQueues = new Map<string, typeof mapped>()
      const companyOrder: string[] = []
      const otherPosts: typeof mapped = []

      for (const post of mapped) {
        const c = (post.company || '').trim()
        if (c) {
          if (!companyQueues.has(c)) {
            companyQueues.set(c, [])
            companyOrder.push(c)
          }
          companyQueues.get(c)!.push(post)
        } else {
          otherPosts.push(post)
        }
      }

      // Deterministic shuffle based on day so order is consistent within the day
      const seed = Math.floor(Date.now() / 86400000)
      const shuffled = [...companyOrder]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = ((seed * (i + 1) * 2654435761) >>> 0) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      // Pure round-robin: one from each company per round
      const interleaved: typeof mapped = []
      const queues = shuffled.map(c => ({ company: c, queue: companyQueues.get(c)! }))
      while (queues.some(q => q.queue.length > 0)) {
        for (const q of queues) {
          if (q.queue.length > 0) {
            interleaved.push(q.queue.shift()!)
          }
        }
      }

      // Spread non-company posts evenly
      if (otherPosts.length > 0 && interleaved.length > 0) {
        const chunkSize = Math.max(1, Math.floor(interleaved.length / (otherPosts.length + 1)))
        const result: typeof mapped = []
        let otherIdx = 0
        for (let i = 0; i < interleaved.length; i++) {
          result.push(interleaved[i])
          if ((i + 1) % chunkSize === 0 && otherIdx < otherPosts.length) {
            result.push(otherPosts[otherIdx++])
          }
        }
        while (otherIdx < otherPosts.length) result.push(otherPosts[otherIdx++])
        mapped = result.slice(from, from + limit)
      } else {
        mapped = interleaved.slice(from, from + limit)
      }
    }

    res.json({
      posts: mapped,
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
    const idOrSlug = req.params.id as string

    // Try slug first, then UUID
    let postQuery = supabase
      .from('community_posts')
      .select(`
        *,
        author:users(id, username, display_name, photo_url, bio),
        community_post_tags(tag:community_tags(name)),
        community_comments(*, author:users(id, username, display_name, photo_url))
      `)

    // Check if it looks like a UUID or a slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    
    if (isUuid) {
      postQuery = postQuery.eq('id', idOrSlug)
    } else {
      postQuery = postQuery.eq('slug', idOrSlug)
    }

    const { data: post, error } = await postQuery.single()

    if (!error && post) {
      return res.json({
        ...post,
        author: post.author,
        tags: (post as any).community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: (post as any).votes_count || 0,
        commentsCount: (post as any).comments_count || 0,
      })
    }

    // Fallback to editorial content
    const { data: editorialPost, error: editorialError } = await supabase
      .from('content')
      .select('id, title, html_content, markdown_content, excerpt, image_url, slug, published_at, word_count')
      .eq('id', idOrSlug)
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

    // Generate slug for job posts
    if (post && type === 'job') {
      const slug = generateSlug(title, post.id)
      await supabase
        .from('community_posts')
        .update({ slug })
        .eq('id', post.id)
      post.slug = slug
    }

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

router.put('/:id', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { title, content, budget, modalidad } = req.body

    const { data: existingPost } = await supabase
      .from('community_posts')
      .select('author_id, slug, title')
      .eq('id', id)
      .single()

    if (!existingPost) {
      return res.status(404).json({ error: 'Publicación no encontrada' })
    }

    if (existingPost.author_id !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta publicación' })
    }

    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (budget !== undefined) updates.budget = budget
    if (modalidad !== undefined) updates.modalidad = modalidad

    // Regenerate slug if title changed (for job posts)
    if (title && title !== existingPost.title) {
      const oldSlug = existingPost.slug
      const newSlug = generateSlug(title, id)
      
      updates.slug = newSlug
      
      // Save old slug to history for redirects
      const { data: post } = await supabase
        .from('community_posts')
        .select('slug_history')
        .eq('id', id)
        .single()
      
      const history = (post?.slug_history as string[]) || []
      if (oldSlug && !history.includes(oldSlug)) {
        history.push(oldSlug)
        updates.slug_history = history
      }
    }

    const { data: updatedPost, error } = await supabase
      .from('community_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({ post: updatedPost })
  } catch (error) {
    console.error('Community Update post error:', error)
    res.status(500).json({ error: 'Error al actualizar la publicación' })
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

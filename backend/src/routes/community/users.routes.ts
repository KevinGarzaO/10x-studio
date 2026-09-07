import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { uploadAvatar } from '../../../services/avatar'

const router = Router()

router.get('/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username as string

    const postsSelect = `id, title, content, type, slug, created_at, votes_count, comments_count, company, company_logo, is_scraper_post, source_url, platform, source_name, original_text, budget, modalidad, community_post_tags(tag:community_tags(name))`

    let { data: user, error } = await supabase
      .from('users')
      .select(`*, community_posts(${postsSelect})`)
      .eq('username', username)
      .single()

    if ((error || !user)) {
      const fallback = await supabase
        .from('users')
        .select(`*, community_posts(${postsSelect})`)
        .eq('handle', username)
        .single()
      user = fallback.data
      error = fallback.error
    }

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    user.username = user.username || user.handle
    user.display_name = user.display_name || user.name

    const author = { id: user.id, username: user.username, display_name: user.display_name, photo_url: user.photo_url }
    const forumPosts = (user.community_posts || []).map((p: any) => ({
      ...p,
      author,
      tags: p.community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
      votesCount: p.votes_count || 0,
      commentsCount: p.comments_count || 0,
    }))

    // Studio-authored articles (the "content" table) aren't community_posts
    // rows — they only carry a plain user_id — so they have to be fetched
    // separately and merged in to show up on the author's own profile.
    const { data: articles } = await supabase
      .from('content')
      .select('id, title, excerpt, markdown_content, slug, published_at')
      .eq('content_type', 'blog_post')
      .eq('status', 'published')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })

    const editorialPosts = (articles || []).map((a: any) => ({
      id: a.id,
      title: a.title,
      content: a.excerpt || a.markdown_content?.substring(0, 500) || '',
      type: 'editorial',
      slug: a.slug,
      created_at: a.published_at,
      author,
      tags: [],
      votesCount: 0,
      commentsCount: 0,
      votes_count: 0,
      comments_count: 0,
    }))

    user.community_posts = [...forumPosts, ...editorialPosts]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    res.json({ user })
  } catch (error) {
    console.error('Community Get user error:', error)
    res.status(500).json({ error: 'Error al obtener el usuario' })
  }
})

const VALID_SENIORITY = ['junior', 'semi_senior', 'senior']
const VALID_ROLE_CATEGORY = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data_engineer',
  'data_scientist', 'qa', 'ux_ui', 'marketing', 'customer_support', 'product', 'otro',
]

router.put('/:username', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const username = req.params.username as string
    const { displayName, bio, avatarUrl, website, githubUrl, title, seniority, skills, location, workModality, roleCategory, photoBase64 } = req.body

    if (seniority && !VALID_SENIORITY.includes(seniority)) {
      return res.status(400).json({ error: 'Nivel de seniority inválido' })
    }
    if (roleCategory && !VALID_ROLE_CATEGORY.includes(roleCategory)) {
      return res.status(400).json({ error: 'Categoría de rol inválida' })
    }

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

    let photoUrl = avatarUrl
    if (photoBase64) {
      const uploaded = await uploadAvatar(photoBase64, user.id)
      if (!uploaded) {
        return res.status(500).json({ error: 'Error al subir la foto de perfil' })
      }
      photoUrl = uploaded
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        bio,
        photo_url: photoUrl,
        website,
        github_url: githubUrl,
        title,
        seniority,
        skills,
        location,
        work_modality: workModality,
        role_category: roleCategory,
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

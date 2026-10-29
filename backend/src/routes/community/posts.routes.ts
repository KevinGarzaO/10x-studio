import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { loadVacancyStats, rankByPopularity, type VacancyStats } from '../../../services/vacancies/popularity'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { generateSlug } from '../../../services/slug'
import { companySlug } from '../../../services/company'
import { loadValidatedSkills } from '../../../services/matching/validated'
import { scoreMatch } from '../../../services/matching/score'
import { evaluateVacancy, MANUAL_PUBLISH_RULE, REJECT_REASON_LABEL } from '../../../services/vacancies/publish-rule'
import { validateMemberPost, normalizeTags, POSTS_PER_DAY } from '../../../services/community/post-rules'
import { uploadPostImage, isCommunityImageUrl } from '../../../services/community/post-images'
import { loadAllowedTags, findInvalidTags } from '../../../services/community/post-tags'

const router = Router()

// Community-specific username/display_name/photo_url can be unset for users
// who only ever signed up through the Studio (Substack connect) — fall back
// to their Studio name/handle so they still show up as themselves everywhere.
function normalizeAuthor(a: any) {
  if (!a) return a
  return {
    id: a.id,
    username: a.username || a.handle,
    display_name: a.display_name || a.name,
    photo_url: a.photo_url,
    ...(a.bio !== undefined ? { bio: a.bio } : {}),
    // Datos públicos del perfil que muestra la tarjeta del autor en el detalle (solo si la consulta los pidió).
    ...(a.location !== undefined ? { location: a.location } : {}),
    ...(a.role_category !== undefined ? { role_category: a.role_category } : {}),
    ...(a.seniority !== undefined ? { seniority: a.seniority } : {}),
    ...(a.created_at !== undefined ? { joined_at: a.created_at } : {}),
  }
}

// The post list/detail endpoints are public (no login required to browse),
// but the "Guardar" bookmark state still needs to reflect a logged-in
// viewer's own history — so auth here is optional, not required.
async function getOptionalUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// Maps community_posts.id -> the user_vacancy_history row id, so the
// frontend has what it needs to call DELETE /api/community/history/:id to
// un-save a post (not just whether it's currently saved).
async function getSavedMap(userId: string | null, postIds: string[]): Promise<Map<string, string>> {
  if (!userId || postIds.length === 0) return new Map()
  const { data } = await supabase
    .from('user_vacancy_history')
    .select('id, source_id')
    .eq('user_id', userId)
    .eq('source_type', 'community')
    .eq('is_saved', true)
    .in('source_id', postIds)
  return new Map((data || []).map((r: any) => [r.source_id, r.id]))
}

// Which of these posts the viewer has voted for (so the arrow shows as pressed after a reload).
async function getVotedSet(userId: string | null, postIds: string[]): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set()
  const { data } = await supabase.from('community_votes').select('post_id').eq('user_id', userId).in('post_id', postIds)
  return new Set((data || []).map((row: any) => row.post_id as string))
}

// votes_count / comments_count have no database trigger, so they are recomputed from the real rows here.
export async function recountVotes(postId: string): Promise<number> {
  const { count } = await supabase.from('community_votes').select('*', { count: 'exact', head: true }).eq('post_id', postId)
  await supabase.from('community_posts').update({ votes_count: count ?? 0 }).eq('id', postId)
  return count ?? 0
}

async function isSuperadmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const { data } = await supabase.from('users').select('is_superadmin').eq('id', userId).maybeSingle()
  return !!data?.is_superadmin
}

router.get('/editorial', async (req: Request, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '20', 10)
    const days = parseInt((req.query.days as string) || '0', 10)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('content')
      .select('id, title, html_content, markdown_content, excerpt, image_url, slug, published_at, word_count, user_id', { count: 'exact' })
      .eq('content_type', 'blog_post')
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('published_at', since)
    }

    const { data: blogPosts, count, error } = await query.range(from, to)

    if (error) throw error

    const authorIds = [...new Set((blogPosts || []).map((p: any) => p.user_id).filter(Boolean))]
    let authorsById = new Map<string, any>()
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from('users')
        .select('id, username, display_name, name, handle, photo_url')
        .in('id', authorIds)
      authorsById = new Map((authors || []).map((u: any) => [u.id, u]))
    }

    const editorialPosts = (blogPosts || []).map((post: any) => {
      const author = post.user_id ? authorsById.get(post.user_id) : null
      return {
        id: post.id,
        title: post.title,
        content: post.excerpt || post.markdown_content?.substring(0, 500) || '',
        type: 'editorial',
        author: author
          ? normalizeAuthor(author)
          : { id: null, username: 'avocado', display_name: 'Avocado Studio', photo_url: null },
        tags: [],
        votesCount: 0,
        commentsCount: 0,
        image_url: post.image_url,
        slug: post.slug,
        word_count: post.word_count,
        created_at: post.published_at,
      }
    })

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
    // `sort=recent`: lo más nuevo primero, paginado en la base. Es lo que usa el
    // feed principal. Sin él se conserva el reparto por empresa, que usan las
    // columnas laterales ("Oportunidades destacadas") para mostrar variedad.
    const recent = (req.query.sort as string | undefined) === 'recent'
    const page = parseInt((req.query.page as string) || '1', 10)
    const limit = parseInt((req.query.limit as string) || '20', 10)
    const from = (page - 1) * limit
    const to = from + limit - 1

    const POST_SELECT = '*, author:users(id, username, display_name, name, handle, photo_url), community_post_tags(tag:community_tags(name))'
    const shape = (p: any) => ({
      ...p,
      author: normalizeAuthor(p.author),
      tags: p.community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
      votesCount: p.votes_count || 0,
      commentsCount: p.comments_count || 0,
    })

    // `sort=popular` (vacantes): la más popular primero, y a igual popularidad la más nueva. Lo usa el feed.
    // La popularidad no vive en una columna, así que se ordena aquí y se pagina después.
    if (type === 'job' && (req.query.sort as string | undefined) === 'popular') {
      const { data: ranks, error: ranksError } = await supabase
        .from('community_posts')
        .select('id, slug, created_at')
        .eq('type', 'job')
        .in('platform', ['lever', 'workable', 'greenhouse'])
        .limit(5000)
      if (ranksError) throw ranksError

      const statsOf = await loadVacancyStats()
      const ranked = rankByPopularity((ranks || []) as { id: string; slug: string | null; created_at: string }[], statsOf)
      const pageIds = ranked.slice(from, from + limit).map((row) => row.id)

      const { data: pagePosts, error: pageError } = pageIds.length
        ? await supabase.from('community_posts').select(POST_SELECT).in('id', pageIds)
        : { data: [] as any[], error: null }
      if (pageError) throw pageError

      const byId = new Map((pagePosts || []).map((row: any) => [row.id, row]))
      let ordered = pageIds.map((id) => byId.get(id)).filter(Boolean).map(shape)

      const viewerId = await getOptionalUserId(req)
      const savedMap = await getSavedMap(viewerId, ordered.map((p: any) => p.id))
      ordered = ordered.map((p: any) => ({ ...p, stats: statsOf(p), isSaved: savedMap.has(p.id), historyId: savedMap.get(p.id) ?? null }))

      return res.json({
        posts: ordered,
        pagination: { page, limit, total: ranked.length, pages: Math.ceil(ranked.length / limit) },
      })
    }

    let query = supabase
      .from('community_posts')
      .select(POST_SELECT, { count: 'exact' })

    if (recent) {
      // El id desempata las vacantes creadas en el mismo instante, para que dos
      // páginas seguidas nunca repitan ni se salten una.
      query = query.order('created_at', { ascending: false })
      query = query.order('id', { ascending: false })
    } else {
      // Order: nativas first (is_scraper_post=false), then by votes, then by date
      query = query.order('is_scraper_post', { ascending: true })
      query = query.order('votes_count', { ascending: false })
      query = query.order('created_at', { ascending: false })
    }

    // `social` = lo que publican los miembros (discusiones y proyectos), todo junto y lo más nuevo primero.
    if (type === 'social') query = query.in('type', ['discussion', 'showcase']).order('created_at', { ascending: false })
    else if (type) query = query.eq('type', type)
    // Only ATS platforms — exclude Telegram/old sources
    if (type === 'job') query = query.in('platform', ['lever', 'workable', 'greenhouse'])
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    // For job posts, fetch ALL to interleave by company (salvo en modo recent,
    // que pagina directo en la base)
    const isJobFeed = type === 'job' && !recent
    if (!isJobFeed) {
      query = query.range(from, to)
    }

    const { data: posts, count, error } = await query

    if (error) throw error

    let mapped = (posts || []).map((p: any) => ({
        ...p,
        author: normalizeAuthor(p.author),
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
        // Group by normalized slug, not the raw string — "Twilio" and
        // "twilio" are the same company (same /empresas/:slug and the same
        // company account elsewhere in the app) and were fragmenting into
        // two separate round-robin queues, which both waters down fairness
        // and eats an extra page-1 slot that could've gone to a company
        // that's actually distinct.
        const c = companySlug((post.company || '').trim())
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

    const viewerId = await getOptionalUserId(req)
    const savedMap = await getSavedMap(viewerId, mapped.map((p: any) => p.id))
    const statsOf = type === 'job' ? await loadVacancyStats() : null
    const votedSet = await getVotedSet(viewerId, mapped.map((p: any) => p.id))
    mapped = mapped.map((p: any) => ({ ...p, ...(statsOf ? { stats: statsOf(p) } : {}), isSaved: savedMap.has(p.id), historyId: savedMap.get(p.id) ?? null, hasVoted: votedSet.has(p.id) }))

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

// "Más de esta persona" (publicaciones) o "Más vacantes de esta empresa" (vacantes), para la columna lateral del detalle.
// Acepta el id o el slug. Solo devuelve lo público: título, etiquetas y fecha.
router.get('/:id/related', async (req: Request, res: Response) => {
  try {
    const idOrSlug = req.params.id as string
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    const { data: current } = await supabase
      .from('community_posts')
      .select('id, type, author_id, company, role_category')
      .eq(isUuid ? 'id' : 'slug', idOrSlug)
      .maybeSingle()

    if (!current) return res.json({ kind: 'none', items: [] })

    const columns = 'id, slug, title, type, company, created_at, community_post_tags(tag:community_tags(name))'
    const toItem = (row: any) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      type: row.type,
      company: row.company ?? null,
      created_at: row.created_at,
      tags: (row.community_post_tags || []).map((entry: any) => entry.tag?.name).filter(Boolean),
    })

    if (current.type === 'job') {
      // Las abiertas (45 días): primero las de la misma empresa y, si faltan, las del mismo puesto.
      const since = new Date(Date.now() - 45 * 86400000).toISOString()
      const base = () => supabase.from('community_posts').select(columns).eq('type', 'job').not('slug', 'is', null).neq('id', current.id).gte('created_at', since).order('created_at', { ascending: false }).limit(4)
      const sameCompany = current.company ? ((await base().eq('company', current.company)).data ?? []) : []
      let items = sameCompany.slice(0, 4)
      let kind = 'company'
      if (items.length < 3 && current.role_category) {
        const taken = new Set(items.map((row: any) => row.id))
        const sameRole = ((await base().eq('role_category', current.role_category)).data ?? []).filter((row: any) => !taken.has(row.id))
        items = [...items, ...sameRole].slice(0, 4)
        if (sameCompany.length === 0) kind = 'role'
      }
      return res.json({ kind, company: current.company ?? null, items: items.map(toItem) })
    }

    if (!current.author_id) return res.json({ kind: 'none', items: [] })
    const { data } = await supabase
      .from('community_posts')
      .select(columns)
      .eq('author_id', current.author_id)
      .neq('id', current.id)
      .in('type', ['discussion', 'showcase'])
      .order('created_at', { ascending: false })
      .limit(4)
    return res.json({ kind: 'author', items: (data ?? []).map(toItem) })
  } catch (error) {
    console.error('Community related posts error:', error)
    res.json({ kind: 'none', items: [] })
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
        author:users(id, username, display_name, name, handle, photo_url, bio, location, role_category, seniority, created_at),
        community_post_tags(tag:community_tags(name)),
        community_comments(*, author:users(id, username, display_name, name, handle, photo_url))
      `)

    // Check if it looks like a UUID or a slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    
    if (isUuid) {
      postQuery = postQuery.eq('id', idOrSlug)
    } else {
      postQuery = postQuery.eq('slug', idOrSlug)
    }

    // Run the community-post lookup and the editorial fallback in parallel
    // instead of sequentially — a slug/id only ever matches one of the two
    // tables, so awaiting one before starting the other just doubles the
    // latency of every detail-page load for no benefit.
    const [{ data: post, error }, { data: editorialPost, error: editorialError }] = await Promise.all([
      postQuery.single(),
      supabase
        .from('content')
        .select('id, title, html_content, markdown_content, excerpt, image_url, slug, published_at, word_count, user_id')
        .eq('id', idOrSlug)
        .single(),
    ])

    if (!error && post) {
      const viewerId = await getOptionalUserId(req)
      const savedMap = await getSavedMap(viewerId, [(post as any).id])

      // En una vacante, qué tan bien encaja con quien la mira (el mismo puntaje de "Para ti").
      let match: ReturnType<typeof scoreMatch> | null = null
      if (viewerId && (post as any).type === 'job') {
        const { data: viewer } = await supabase
          .from('users')
          .select('role_category, seniority, skills, work_modality')
          .eq('id', viewerId)
          .maybeSingle()
        if (viewer?.role_category) {
          const vacancy = post as any
          match = scoreMatch(
            {
              roleCategory: viewer.role_category,
              seniority: viewer.seniority ?? null,
              skills: ((viewer.skills || []) as string[]).map((skill) => skill.toLowerCase()),
              workModality: viewer.work_modality ?? null,
              validatedSkills: await loadValidatedSkills(viewerId),
            },
            {
              roleCategory: vacancy.role_category ?? null,
              seniority: vacancy.seniority_level ?? null,
              skills: (Array.isArray(vacancy.skills) ? vacancy.skills : []).map((skill: string) => skill.toLowerCase()),
              workModality: vacancy.modalidad ?? null,
            },
          )
        }
      }

      const stats: VacancyStats | null = (post as any).type === 'job' ? (await loadVacancyStats())(post as any) : null

      return res.json({
        ...post,
        match,
        ...(stats ? { stats } : {}),
        author: normalizeAuthor(post.author),
        community_comments: ((post as any).community_comments || []).map((c: any) => ({ ...c, author: normalizeAuthor(c.author) })),
        tags: (post as any).community_post_tags?.map((pt: any) => pt.tag?.name).filter(Boolean) || [],
        votesCount: (post as any).votes_count || 0,
        commentsCount: (post as any).comments_count || 0,
        isSaved: savedMap.has((post as any).id),
        historyId: savedMap.get((post as any).id) ?? null,
        hasVoted: (await getVotedSet(viewerId, [(post as any).id])).has((post as any).id),
      })
    }

    if (!editorialError && editorialPost) {
      let editorialAuthor: any = null
      if ((editorialPost as any).user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('id, username, display_name, name, handle, photo_url')
          .eq('id', (editorialPost as any).user_id)
          .single()
        editorialAuthor = u ? normalizeAuthor(u) : null
      }
      return res.json({
        id: editorialPost.id,
        title: editorialPost.title,
        content: editorialPost.html_content || editorialPost.markdown_content || '',
        excerpt: editorialPost.excerpt || '',
        type: 'editorial',
        author: editorialAuthor || {
          id: null,
          username: 'avocado',
          display_name: 'Avocado Studio',
          photo_url: null,
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

// Tope por persona: subir imágenes escribe en el almacenamiento.
const imageUploads = new Map<string, { count: number; resetAt: number }>()
function allowedImageUpload(userId: string): boolean {
  const now = Date.now()
  const entry = imageUploads.get(userId)
  if (!entry || entry.resetAt < now) {
    imageUploads.set(userId, { count: 1, resetAt: now + 3600000 })
    return true
  }
  entry.count += 1
  return entry.count <= 30
}

/**
 * POST /api/community/posts/upload-image — sube una imagen (la portada o una del texto) y devuelve su dirección.
 * Solo PNG, JPG, WEBP o GIF de hasta 5 MB, solo miembros con el perfil completo, hasta 30 por hora.
 */
router.post('/upload-image', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data: member } = await supabase.from('users').select('profile_completed').eq('id', req.userId).maybeSingle()
    if (!member?.profile_completed) {
      return res.status(403).json({ error: 'profile_incomplete', message: 'Completa tu perfil para poder subir imágenes.' })
    }
    if (!allowedImageUpload(req.userId as string)) {
      return res.status(429).json({ error: 'rate_limited', message: 'Subiste muchas imágenes seguidas. Espera un rato.' })
    }

    const result = await uploadPostImage(req.body?.dataUrl, req.userId as string)
    if (!result.ok) return res.status(400).json({ error: 'invalid_image', message: result.error })
    res.status(201).json({ url: result.url })
  } catch (error) {
    console.error('Community upload image error:', error)
    res.status(500).json({ error: 'No se pudo subir la imagen' })
  }
})

router.post('/', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, budget, modalidad, tags, roleCategory, seniority, skills, applyUrl, company, location, imageUrl } = req.body

    if (!title || !content || !type) {
      return res.status(400).json({ error: 'Título, contenido y tipo son requeridos' })
    }

    // Lo que se guarda: para discusiones y proyectos, el texto ya validado y limpio (ver services/community/post-rules.ts).
    let postTitle: string = title
    let postContent: string = content
    let postTags: string[] | undefined = tags

    if (type === 'job') {
      // Mientras el alta de empresas esté en pausa, solo el equipo crea vacantes a mano.
      if (!(await isSuperadmin(req.userId))) {
        return res.status(403).json({ error: 'jobs_paused', message: 'Por ahora las vacantes las publica solo el equipo de AvoTalent.' })
      }
    } else {
      const check = validateMemberPost({ title, content, type, tags })
      if (!check.ok) {
        return res.status(400).json({ error: 'invalid_post', errors: check.errors, message: check.errors.join(' ') })
      }
      postTitle = check.clean.title
      postContent = check.clean.content
      postTags = check.clean.tags

      // Las etiquetas solo pueden ser puestos o skills del catálogo.
      if (postTags.length > 0) {
        const invalid = findInvalidTags(postTags, await loadAllowedTags())
        if (invalid.length > 0) {
          return res.status(400).json({
            error: 'invalid_tags',
            invalid,
            message: `Las etiquetas deben ser un puesto o un skill de la lista. No se reconoce: ${invalid.join(', ')}.`,
          })
        }
      }

      const { data: member } = await supabase.from('users').select('profile_completed').eq('id', req.userId).maybeSingle()
      if (!member?.profile_completed) {
        return res.status(403).json({ error: 'profile_incomplete', message: 'Completa tu perfil para poder publicar.' })
      }

      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { count: today } = await supabase
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', req.userId)
        .in('type', ['discussion', 'showcase'])
        .gte('created_at', since)
      if ((today ?? 0) >= POSTS_PER_DAY) {
        return res.status(429).json({ error: 'daily_limit', message: `Ya publicaste ${POSTS_PER_DAY} veces en las últimas 24 horas. Vuelve mañana.` })
      }
    }

    // REGLA DE NEGOCIO (services/vacancies/publish-rule.ts): una vacante solo se publica si
    // queda ligada a los catálogos. Es la misma regla que se le exige a las que trae el
    // scraper; sin ella no se podría cruzar con candidatos ni medir.
    const vacancy: Record<string, unknown> = {}
    if (type === 'job') {
      const requestedSkills: string[] = Array.isArray(skills) ? skills.filter((s: unknown): s is string => typeof s === 'string') : []

      const [{ data: catalogRows }, { data: author }] = await Promise.all([
        supabase.from('skills').select('name'),
        supabase.from('users').select('display_name').eq('id', req.userId).maybeSingle(),
      ])

      const verdict = evaluateVacancy(
        {
          title,
          company: company || author?.display_name,
          applyUrl,
          location,
          roleCategory,
          skills: requestedSkills,
          seniority,
          modality: modalidad,
        },
        new Set((catalogRows || []).map((row: { name: string }) => row.name)),
        // Una vacante creada a mano exige además nivel y modalidad: quien publica los sabe.
        MANUAL_PUBLISH_RULE,
      )

      if (!verdict.valid) {
        return res.status(400).json({
          error: 'vacancy_not_linked',
          reasons: verdict.reasons,
          message: `La vacante no se puede publicar: ${verdict.reasons.map((reason) => REJECT_REASON_LABEL[reason]).join(', ')}. Elige un rol, un nivel, una modalidad y al menos un skill del catálogo, e indica la ubicación y el enlace para postularse.`,
        })
      }

      Object.assign(vacancy, {
        role_category: roleCategory,
        seniority_level: seniority,
        location: String(location).trim(),
        skills: requestedSkills,
        source_url: applyUrl,
        company: company || author?.display_name,
      })
    }

    // La portada solo puede ser una imagen que se subió a nuestro almacenamiento (no una dirección cualquiera).
    const cover = type !== 'job' && isCommunityImageUrl(imageUrl) ? imageUrl : null

    const row = {
      title: postTitle,
      content: postContent,
      type,
      budget,
      modalidad,
      author_id: req.userId,
      ...vacancy,
    }
    let { data: post, error } = await supabase
      .from('community_posts')
      .insert(cover ? { ...row, image_url: cover } : row)
      .select()
      .single()

    // Mientras la columna `image_url` no exista (community-post-images-migration.sql sin aplicar), la publicación se
    // guarda igual, sin portada: mejor eso que perder lo que la persona escribió.
    if (error && cover && /image_url/.test(String(error.message))) {
      ;({ data: post, error } = await supabase.from('community_posts').insert(row).select().single())
    }

    if (error) throw error

    // Generate slug for job posts
    if (post && type === 'job') {
      const slug = generateSlug(postTitle, post.id)
      await supabase
        .from('community_posts')
        .update({ slug })
        .eq('id', post.id)
      post.slug = slug
    }

    if (postTags?.length && post) {
      for (const tagName of postTags) {
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

    if (post.author_id !== req.userId && !(await isSuperadmin(req.userId))) {
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
      return res.json({ voted: false, votesCount: await recountVotes(id) })
    }

    const { error: voteError } = await supabase.from('community_votes').insert({
      user_id: req.userId,
      post_id: id,
    })
    if (voteError) return res.status(404).json({ error: 'Publicación no encontrada' })

    res.json({ voted: true, votesCount: await recountVotes(id) })
  } catch (error) {
    console.error('Community Vote error:', error)
    res.status(500).json({ error: 'Error al votar' })
  }
})

export default router

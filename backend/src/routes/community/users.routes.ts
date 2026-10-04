import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'
import { uploadAvatar } from '../../../services/avatar'
import { sameSkills } from '../../../lib/same-skills'
import { buildCandidateProfileSchema, firstUnapprovedSkill, cvPayloadSchema, parseStoredCv } from '@avocado/schemas'
import { requireAccountType } from '../../middleware/require-account-type.middleware'

const router = Router()

/**
 * Columnas de `users` que NUNCA salen en un perfil público, aunque la consulta
 * traiga la fila entera (select('*')): el correo de contacto, identificadores
 * internos, marcas de administración y de prueba, y el CV, que es privado salvo
 * que su dueño lo publique (se sirve aparte, en GET /:username/cv).
 */
export const PRIVATE_USER_FIELDS = [
  'email',
  'substack_user_id',
  'is_superadmin',
  'is_test_account',
  'claimed_by',
  'company_id',
  'cv',
  'cv_public',
] as const

/**
 * Carga un perfil público completo: la cuenta, sus publicaciones (de la
 * comunidad y del studio) y sus niveles validados.
 *
 * Vive aquí y se exporta porque el perfil de empresa
 * (GET /api/community/companies/:slug) necesita exactamente la misma forma: la
 * única diferencia es cómo se encuentra la fila.
 */
export async function loadPublicProfile(
  find: () => Promise<{ data: any; error: any }>,
): Promise<any | null> {
  const { data: user, error } = await find()
  if (error || !user) return null

  for (const field of PRIVATE_USER_FIELDS) delete user[field]

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

  // Niveles validados por examen (feature 002). Publicos por diseño: son la
  // señal que las empresas vienen a ver.
  //
  // Se filtran contra users.skills a proposito: si el candidato retira un
  // skill de su perfil el nivel deja de mostrarse (la fila se conserva, y el
  // nivel reaparece si vuelve a declararlo).
  const declared: string[] = user.skills || []
  const { data: levels } = await supabase
    .from('user_skill_levels')
    .select('skill_name, level, achieved_at')
    .eq('user_id', user.id)

  user.skillLevels = (levels || [])
    .filter((l: any) => declared.includes(l.skill_name))
    .map((l: any) => ({ skillName: l.skill_name, level: l.level, achievedAt: l.achieved_at }))

  return user
}

export const PROFILE_POSTS_SELECT = `id, title, content, type, slug, created_at, votes_count, comments_count, company, company_logo, is_scraper_post, source_url, platform, source_name, original_text, budget, modalidad, community_post_tags(tag:community_tags(name))`

router.get('/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username as string

    const user = await loadPublicProfile(async () => {
      const primary = await supabase
        .from('users')
        .select(`*, community_posts(${PROFILE_POSTS_SELECT})`)
        .eq('username', username)
        .single()

      if (!primary.error && primary.data) return primary

      return supabase
        .from('users')
        .select(`*, community_posts(${PROFILE_POSTS_SELECT})`)
        .eq('handle', username)
        .single()
    })

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json({ user })
  } catch (error) {
    console.error('Community Get user error:', error)
    res.status(500).json({ error: 'Error al obtener el usuario' })
  }
})

/**
 * Los errores que lanzan los triggers de la feature 003 y el 400 equivalente.
 * Cubren la carrera real: el catálogo se leyó, y entre eso y el UPDATE el
 * superadmin borró el skill. El trigger es la autoridad, así que su rechazo se
 * traduce en lugar de convertirse en un 500 (contracts/profile-and-accounts.md).
 */
function translateProfileTriggerError(message: string): { status: number; body: object } | null {
  const skillNotInCatalog = message.match(/skill_not_in_catalog:\s*(\S+)/)
  if (skillNotInCatalog) {
    return {
      status: 400,
      body: {
        error: 'skill_not_in_catalog',
        field: 'skills',
        skill: skillNotInCatalog[1],
        message: `El skill "${skillNotInCatalog[1]}" no está en el catálogo aprobado`,
      },
    }
  }

  const cleared = message.match(/required_field_cleared:\s*(\S+)/)
  if (cleared) {
    return {
      status: 400,
      body: {
        error: 'required_field_cleared',
        field: cleared[1],
        message: 'No puedes dejar vacío un dato obligatorio de tu perfil',
      },
    }
  }

  if (message.includes('duplicate_skill')) {
    return {
      status: 400,
      body: { error: 'validation_error', field: 'skills', message: 'No repitas un skill' },
    }
  }

  return null
}


/**
 * Quién pregunta, si trae sesión. El CV público no la exige, pero el dueño ve el
 * suyo aunque sea privado, así que se mira el token si viene.
 */
async function optionalViewerId(req: Request): Promise<string | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(header.split(' ')[1])
  return error || !data?.user ? null : data.user.id
}

/** Lo del perfil que un CV muestra: nada de correo ni de marcas internas. */
const CV_PROFILE_COLUMNS =
  'id, username, display_name, photo_url, title, role_category, seniority, location, work_modality, skills, website, github_url, bio, account_type, cv, cv_public'

/**
 * GET /api/community/users/:username/cv
 *
 * El CV en línea. Es público solo si su dueño lo publicó; si no, solo lo ve él. A
 * cualquier otra persona un CV privado le responde igual que uno que no existe,
 * para no revelar que la cuenta tiene uno.
 */
router.get('/:username/cv', async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select(CV_PROFILE_COLUMNS)
      .eq('username', req.params.username as string)
      .maybeSingle()

    if (!user || user.account_type !== 'candidate') {
      return res.status(404).json({ error: 'CV no encontrado' })
    }

    const isOwner = (await optionalViewerId(req)) === user.id
    if (!user.cv_public && !isOwner) {
      return res.status(404).json({ error: 'CV no encontrado' })
    }

    const { cv, cv_public, account_type, ...profile } = user
    res.json({ profile, cv: parseStoredCv(cv), isPublic: !!cv_public, isOwner })
  } catch (error) {
    console.error('Community Get CV error:', error)
    res.status(500).json({ error: 'Error al obtener el CV' })
  }
})

/**
 * PUT /api/community/users/:username/cv
 *
 * Guarda el CV y si es visible en línea. Va aparte del perfil a propósito: el
 * perfil exige campos obligatorios en cada guardado, y un CV se llena de a poco.
 * Un CV nuevo nace privado.
 */
router.put(
  '/:username/cv',
  communityAuthMiddleware,
  requireAccountType('candidate'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('username', req.params.username as string)
        .maybeSingle()

      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
      if (user.id !== req.userId) {
        return res.status(403).json({ error: 'No tienes permiso para editar este CV' })
      }

      const parsed = cvPayloadSchema.safeParse(req.body)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return res.status(400).json({
          error: 'validation_error',
          field: issue.path.join('.') || null,
          message: issue.message,
        })
      }

      const { error } = await supabase
        .from('users')
        .update({ cv: parsed.data.cv, cv_public: parsed.data.public })
        .eq('id', user.id)

      if (error) throw error

      res.json({ cv: parsed.data.cv, isPublic: parsed.data.public })
    } catch (error) {
      console.error('Community Update CV error:', error)
      res.status(500).json({ error: 'Error al guardar el CV' })
    }
  },
)

router.put(
  '/:username',
  communityAuthMiddleware,
  requireAccountType('candidate'),
  async (req: AuthRequest, res: Response) => {
    try {
      const username = req.params.username as string

      const { data: user } = await supabase
        .from('users')
        .select('id, photo_url, skills')
        .eq('username', username)
        .single()

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }

      if (user.id !== req.userId) {
        return res.status(403).json({ error: 'No tienes permiso para editar este perfil' })
      }

      // El catálogo se lee en cada petición, igual que en
      // exam-questions.routes.ts: un skill aprobado hace un momento tiene que
      // poder guardarse ya.
      const { data: skillRows, error: skillsError } = await supabase.from('skills').select('name')
      if (skillsError) throw skillsError

      // Los skills que el perfil ya tiene guardados siguen valiendo: cambiar la
      // foto o la bio no debe obligar a rehacerlos. Solo los NUEVOS tienen que
      // venir del catálogo aprobado.
      const allowedSkills = [
        ...(skillRows || []).map((row) => row.name as string),
        ...(Array.isArray(user.skills) ? (user.skills as string[]) : []),
      ]
      const schema = buildCandidateProfileSchema(allowedSkills)
      const parsed = schema.safeParse(req.body)

      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const field = issue.path[0] ?? null
        // Un skill fuera del catálogo tiene su propio código, para que el
        // formulario pueda señalar el chip culpable.
        if (field === 'skills' && Array.isArray(req.body?.skills)) {
          const offending = firstUnapprovedSkill(
            req.body.skills.filter((s: unknown) => typeof s === 'string'),
            allowedSkills,
          )
          if (offending) {
            return res.status(400).json({
              error: 'skill_not_in_catalog',
              field: 'skills',
              skill: offending,
              message: `El skill "${offending}" no está en el catálogo aprobado`,
            })
          }
        }
        return res.status(400).json({ error: 'validation_error', field, message: issue.message })
      }

      const data = parsed.data
      const photoBase64 = typeof req.body?.photoBase64 === 'string' ? req.body.photoBase64 : null

      let photoUrl = user.photo_url as string | null
      if (photoBase64) {
        const uploaded = await uploadAvatar(photoBase64, user.id)
        if (!uploaded) {
          return res.status(500).json({ error: 'Error al subir la foto de perfil' })
        }
        photoUrl = uploaded
      }

      // La foto es obligatoria para toda cuenta (FR-024). No puede ser NOT NULL
      // en la DB porque la cuenta existe desde el registro, antes del
      // onboarding, así que el guardado es donde se exige.
      if (!photoUrl || photoUrl.trim() === '') {
        return res.status(400).json({
          error: 'photo_required',
          field: 'photo',
          message: 'Tu foto de perfil es obligatoria',
        })
      }

      const { data: updated, error } = await supabase
        .from('users')
        .update({
          display_name: data.displayName,
          bio: data.bio,
          photo_url: photoUrl,
          website: data.website,
          github_url: data.githubUrl,
          title: data.title,
          seniority: data.seniority,
          // Solo se escribe `skills` si cambiaron: el trigger de la base los
          // revisa contra el catálogo en cada UPDATE que los incluya, y un
          // guardado de foto o bio no debe fallar por eso.
          ...(sameSkills(data.skills, user.skills) ? {} : { skills: data.skills }),
          location: data.location,
          work_modality: data.workModality,
          role_category: data.roleCategory,
        })
        .eq('username', username)
        .select()
        .single()

      if (error) {
        const translated = translateProfileTriggerError(error.message || '')
        if (translated) {
          return res.status(translated.status).json(translated.body)
        }
        throw error
      }

      res.json({ user: updated })
    } catch (error) {
      console.error('Community Update user error:', error)
      res.status(500).json({ error: 'Error al actualizar el perfil' })
    }
  },
)

export default router

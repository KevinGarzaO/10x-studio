import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { rankFeaturedUsers, type FeaturedCandidate } from '../../../services/community/featured-users'
import { matchRoles, sanitizeQuery } from '../../../services/community/search-text'
import { PUBLIC_ROLES, roleLabel, roleSlug } from '../../../services/seo/role-slug'
import { companySlug } from '../../../services/company'

const router = Router()

async function viewerOf(req: Request): Promise<string | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const { data, error } = await supabase.auth.getUser(header.split(' ')[1])
  return error || !data.user ? null : data.user.id
}

/** Las personas de verdad: ni pruebas, ni el equipo, ni los perfiles que crea el scraper. */
const realCandidates = () =>
  supabase
    .from('users')
    .select('id, username, display_name, photo_url, role_category, seniority, skills, created_at')
    .eq('user_kind', 'user')
    .eq('is_test_account', false)
    .not('is_scraper_profile', 'is', true)
    .eq('profile_completed', true)

/**
 * GET /api/community/discover/featured-users — quiénes destacan en la comunidad.
 *
 * AUTH: requiere sesión. Son perfiles de personas (nombre, foto, puesto y skills): solo se muestran a
 * quien ya es miembro.
 */
router.get('/featured-users', async (req: Request, res: Response) => {
  try {
    const viewerId = await viewerOf(req)
    if (!viewerId) return res.status(401).json({ error: 'Inicia sesión para ver a la comunidad' })

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '5'), 10) || 5, 1), 12)
    const { data, error } = await realCandidates().limit(1000)
    if (error) throw error
    const candidates = (data ?? []) as FeaturedCandidate[]

    const validatedBy = new Map<string, number>()
    if (candidates.length > 0) {
      const { data: levels } = await supabase.from('user_skill_levels').select('user_id').in('user_id', candidates.map((person) => person.id))
      for (const row of (levels ?? []) as { user_id: string }[]) validatedBy.set(row.user_id, (validatedBy.get(row.user_id) ?? 0) + 1)
    }

    res.json({ users: rankFeaturedUsers({ candidates, validatedBy, viewerId, limit }) })
  } catch (error) {
    console.error('Featured users error:', error)
    res.status(500).json({ error: 'No se pudo cargar a la comunidad' })
  }
})

/**
 * GET /api/community/discover/search?q= — la búsqueda de la barra superior, con los datos reales.
 *
 * Devuelve por grupos: vacantes, personas, empresas, skills y puestos. Las personas solo salen con sesión
 * (son perfiles de miembros); lo demás ya es visible en el feed y en las páginas públicas.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = sanitizeQuery(req.query.q)
    if (q.length < 2) return res.json({ q, vacancies: [], people: [], companies: [], skills: [], roles: [] })

    const viewerId = await viewerOf(req)
    const pattern = `%${q}%`
    const since = new Date(Date.now() - 45 * 86400000).toISOString()

    const [vacancies, people, companies, skills] = await Promise.all([
      supabase
        .from('community_posts')
        .select('id, slug, title, company, company_logo, location, modalidad, seniority_level')
        .eq('type', 'job')
        .not('slug', 'is', null)
        .gte('created_at', since)
        .or(`title.ilike.${pattern},company.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(6),
      viewerId
        ? realCandidates().or(`username.ilike.${pattern},display_name.ilike.${pattern}`).limit(5)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      supabase
        .from('users')
        .select('display_name, name, company_slug, photo_url')
        .eq('account_type', 'company')
        .eq('is_test_account', false)
        .or(`display_name.ilike.${pattern},name.ilike.${pattern}`)
        .limit(4),
      supabase.from('skills').select('name, label').or(`name.ilike.${pattern},label.ilike.${pattern}`).limit(5),
    ])

    res.json({
      q,
      vacancies: (vacancies.data ?? []).map((row: any) => ({
        slug: row.slug,
        title: row.title,
        company: row.company ?? null,
        companyLogo: row.company_logo ?? null,
        location: row.location ?? null,
        modalidad: row.modalidad ?? null,
        seniority: row.seniority_level ?? null,
      })),
      people: ((people.data ?? []) as any[]).map((row) => ({
        username: row.username,
        displayName: row.display_name || row.username,
        photoUrl: row.photo_url ?? null,
        roleCategory: row.role_category ?? null,
        seniority: row.seniority ?? null,
      })),
      companies: (companies.data ?? [])
        .map((row: any) => {
          const name = row.display_name || row.name
          return name ? { name, slug: row.company_slug || companySlug(name), logo: row.photo_url ?? null } : null
        })
        .filter(Boolean),
      skills: (skills.data ?? []).map((row: any) => ({ name: row.name, label: row.label })),
      roles: matchRoles(PUBLIC_ROLES.map((role) => ({ role, slug: roleSlug(role), label: roleLabel(role) })), q).slice(0, 4),
    })
  } catch (error) {
    console.error('Search error:', error)
    res.status(500).json({ error: 'No se pudo buscar' })
  }
})

export default router

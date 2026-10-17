import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'

const router = Router()

// Conteos reales para el widget "La comunidad". No hay seguimiento de presencia,
// así que "en línea" y "% que responde" no tienen número real y no se devuelven.
//
// Solo cuentan cuentas REALES: las de prueba (is_test_account) no, y tampoco los
// perfiles que crea el scraper. Se reparten en:
//   members    personas con el perfil completo: candidatos y superadmins
//   companies  empresas, con o sin dueño (las del scraper también son empresas
//              reales que publican vacantes en el sitio)
//   vacancies  vacantes publicadas
// `posts` se conserva por compatibilidad con la versión anterior del frontend.
async function countCommunity(onlyCompleteProfiles = true) {
  const count = (table: string, build: (q: any) => any) =>
    build(supabase.from(table).select('*', { count: 'exact', head: true }))

  const [members, companies, vacancies, posts] = await Promise.all([
    // Un miembro cuenta cuando completó su perfil (users.profile_completed): quien se
    // registró pero no terminó el onboarding todavía no es parte visible de la comunidad.
    count('users', q => {
      const real = q.in('user_kind', ['user', 'superadmin']).eq('is_test_account', false).not('is_scraper_profile', 'is', true)
      return onlyCompleteProfiles ? real.eq('profile_completed', true) : real
    }),
    count('users', q => q.eq('user_kind', 'company').eq('is_test_account', false)),
    count('community_posts', q => q.eq('type', 'job')),
    count('community_posts', q => q),
  ])

  for (const result of [members, companies, vacancies, posts]) {
    if (result.error) throw result.error
  }

  return {
    members: members.count || 0,
    companies: companies.count || 0,
    vacancies: vacancies.count || 0,
    posts: posts.count || 0,
  }
}

// Mientras las migraciones user_kind / is_test_account no estén aplicadas en la
// base, el conteo nuevo no existe: se cuenta como antes en vez de dejar el
// widget roto.
async function countCommunityLegacy() {
  const count = (table: string, build: (q: any) => any) =>
    build(supabase.from(table).select('*', { count: 'exact', head: true }))

  const [members, companies, vacancies, posts] = await Promise.all([
    count('users', q => q.neq('account_type', 'company')),
    count('users', q => q.eq('account_type', 'company')),
    count('community_posts', q => q.eq('type', 'job')),
    count('community_posts', q => q),
  ])

  for (const result of [members, companies, vacancies, posts]) {
    if (result.error) throw result.error
  }

  return {
    members: members.count || 0,
    companies: companies.count || 0,
    vacancies: vacancies.count || 0,
    posts: posts.count || 0,
  }
}

router.get('/', async (req: Request, res: Response) => {
  try {
    try {
      try {
        return res.json(await countCommunity())
      } catch (error: any) {
        // Sin profile_completed (migración sin aplicar) se cuenta a todos los miembros reales.
        if (!/profile_completed/.test(String(error?.message))) throw error
        console.warn('[Stats] Falta users.profile_completed: se cuentan todos los miembros reales')
        return res.json(await countCommunity(false))
      }
    } catch (error: any) {
      if (!/user_kind|is_test_account/.test(String(error?.message))) throw error
      console.warn('[Stats] Faltan user_kind / is_test_account: se cuenta sin separar pruebas')
      return res.json(await countCommunityLegacy())
    }
  } catch (error) {
    console.error('Community Get stats error:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

// Most-used tags across community posts, for the "Tus temas" sidebar
// section — replaces the fixed javascript/react/nextjs/... list.
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '6', 10)

    const { data, error } = await supabase
      .from('community_post_tags')
      .select('tag:community_tags(name)')

    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data || []) {
      const name = (row as any).tag?.name
      if (!name) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }

    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }))

    res.json({ tags })
  } catch (error) {
    console.error('Community Get trending tags error:', error)
    res.status(500).json({ error: 'Error al obtener los temas' })
  }
})

const SCRAPER_BOT_ID = '00000000-0000-0000-0000-000000000001'

// Companies with at least one active job post right now, for the hero
// banner's trust strip — real logos of companies actually hiring today,
// not a fixed hand-picked list, so it never shows a stale/false claim.
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '6', 10)

    const { data, error } = await supabase
      .from('community_posts')
      .select('author:users(id, username, company_slug, display_name, name, photo_url)')
      .eq('type', 'job')

    if (error) throw error

    const counts = new Map<
      string,
      { username: string; companySlug: string; name: string; logo_url: string | null; count: number }
    >()
    for (const row of data || []) {
      const author = (row as any).author
      if (!author || !author.id || author.id === SCRAPER_BOT_ID) continue
      const existing = counts.get(author.username)
      if (existing) {
        existing.count++
      } else {
        counts.set(author.username, {
          username: author.username,
          // El enlace público sale de company_slug, no del username: una empresa
          // cuyo slug ya usaba una persona tiene un username distinto (FR-029).
          companySlug: author.company_slug || author.username,
          name: author.display_name || author.name || author.username,
          logo_url: author.photo_url,
          count: 1,
        })
      }
    }

    const companies = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(({ username, companySlug, name, logo_url }) => ({ username, companySlug, name, logo_url }))

    res.json({ companies })
  } catch (error) {
    console.error('Community Get hiring companies error:', error)
    res.status(500).json({ error: 'Error al obtener las empresas' })
  }
})

export default router

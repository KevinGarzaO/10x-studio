import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { seoDescription } from '../../../services/seo/vacancy-description'

const router = Router()

/**
 * Datos PÚBLICOS para los buscadores: las páginas de empleos por skill, el sitemap y el
 * JSON-LD de Google for Jobs. Los lee el servidor de la comunidad, no un navegador.
 *
 * Solo salen campos seguros. Las vacantes guardan correo, teléfono y enlaces de
 * contacto, que el sitio muestra solo con cuenta: aquí nunca se devuelven (ni el
 * `content` completo, que los trae dentro).
 */

/** Una vacante deja de aceptar solicitudes a los 45 días (el mismo plazo del JSON-LD). */
export const ACTIVE_DAYS = 45

const SAFE_FIELDS = 'id, slug, title, company, company_logo, location, modalidad, seniority_level, role_category, skills, budget, created_at'

/**
 * Lo que sale de una vacante, campo por campo. Además de pedir solo estas columnas, se
 * copian una por una: si alguna vez la consulta trajera de más (un `*`, un campo nuevo con
 * contacto), eso no llegaría al público por accidente.
 */
function publicVacancy(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    company: row.company ?? null,
    company_logo: row.company_logo ?? null,
    location: row.location ?? null,
    modalidad: row.modalidad ?? null,
    seniority_level: row.seniority_level ?? null,
    role_category: row.role_category ?? null,
    skills: toSkills(row.skills),
    budget: row.budget ?? null,
    created_at: row.created_at,
  }
}

export function clearSeoCache() {
  cache.clear()
}

const toSkills = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((skill): skill is string => typeof skill === 'string') : [])
const activeSince = () => new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString()

// Los rastreadores piden lo mismo muchas veces: unos minutos de caché bastan para no
// cargar la base, y una vacante nueva aparece en el sitemap con retraso mínimo.
const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Los skills del catálogo con cuántas vacantes ACTIVAS tiene cada uno (solo los que tienen al menos una). */
router.get('/skills', async (_req: Request, res: Response) => {
  try {
    const skills = await cached('skills', async () => {
      const [{ data: catalog, error: catalogError }, { data: posts, error: postsError }] = await Promise.all([
        supabase.from('skills').select('name, label').order('label', { ascending: true }),
        supabase.from('community_posts').select('skills').eq('type', 'job').gte('created_at', activeSince()).limit(5000),
      ])
      if (catalogError) throw catalogError
      if (postsError) throw postsError

      const counts = new Map<string, number>()
      for (const post of posts || []) for (const skill of new Set(toSkills(post.skills))) counts.set(skill, (counts.get(skill) ?? 0) + 1)

      return (catalog || [])
        .map((skill: { name: string; label: string }) => ({ name: skill.name, label: skill.label, vacancies: counts.get(skill.name) ?? 0 }))
        .filter((skill) => skill.vacancies > 0)
        .sort((a, b) => b.vacancies - a.vacancies || a.label.localeCompare(b.label))
    })
    res.json({ skills })
  } catch (error) {
    console.error('SEO skills error:', error)
    res.status(500).json({ error: 'No se pudieron leer los skills' })
  }
})

/** Un skill del catálogo (exista o no con vacantes), para su página. */
router.get('/skills/:name', async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name).toLowerCase().trim()
    const { data, error } = await supabase.from('skills').select('name, label').eq('name', name).maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Skill no encontrado' })
    res.json({ skill: data })
  } catch (error) {
    console.error('SEO skill error:', error)
    res.status(500).json({ error: 'No se pudo leer el skill' })
  }
})

/**
 * Vacantes activas, de la más nueva a la más vieja. `skill` filtra por un skill; `exclude`
 * quita una vacante (para "similares").
 */
router.get('/vacancies', async (req: Request, res: Response) => {
  try {
    const skill = typeof req.query.skill === 'string' ? req.query.skill.toLowerCase().trim() : ''
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : ''
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '30'), 10) || 30, 1), 100)

    let query = supabase
      .from('community_posts')
      .select(SAFE_FIELDS)
      .eq('type', 'job')
      .not('slug', 'is', null)
      .gte('created_at', activeSince())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (skill) query = query.contains('skills', JSON.stringify([skill]))
    if (exclude) query = query.neq('slug', exclude)

    const { data, error } = await query
    if (error) throw error
    res.json({ vacancies: (data || []).map(publicVacancy) })
  } catch (error) {
    console.error('SEO vacancies error:', error)
    res.status(500).json({ error: 'No se pudieron leer las vacantes' })
  }
})

/** Una vacante para su JSON-LD: campos seguros, descripción sin contacto y si ya venció. */
router.get('/vacancy/:slug', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .select(`${SAFE_FIELDS}, content, original_text`)
      .eq('type', 'job')
      .eq('slug', String(req.params.slug))
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Vacante no encontrada' })

    const row = data as any
    res.json({
      vacancy: {
        ...publicVacancy(row),
        description: seoDescription(row.original_text || row.content, row.title),
        expired: Date.parse(row.created_at) < Date.now() - ACTIVE_DAYS * 86400000,
      },
    })
  } catch (error) {
    console.error('SEO vacancy error:', error)
    res.status(500).json({ error: 'No se pudo leer la vacante' })
  }
})

/** Todo lo que va en el sitemap: los skills con vacantes y las vacantes (activas y vencidas, que siguen existiendo). */
router.get('/sitemap', async (_req: Request, res: Response) => {
  try {
    const value = await cached('sitemap', async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('slug, created_at, skills')
        .eq('type', 'job')
        .not('slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw error

      const since = Date.parse(activeSince())
      const skillDates = new Map<string, string>()
      for (const post of data || []) {
        if (Date.parse(post.created_at) < since) continue
        for (const skill of toSkills(post.skills)) if (!skillDates.has(skill)) skillDates.set(skill, post.created_at)
      }

      return {
        skills: [...skillDates.entries()].map(([name, lastModified]) => ({ name, lastModified })),
        vacancies: (data || []).map((post: any) => ({ slug: post.slug as string, lastModified: post.created_at as string })),
      }
    })
    res.json(value)
  } catch (error) {
    console.error('SEO sitemap error:', error)
    res.status(500).json({ error: 'No se pudo armar el sitemap' })
  }
})

export default router

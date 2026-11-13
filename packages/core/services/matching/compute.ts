import { supabase } from '../supabase.service'
import { scoreMatch, type ValidationLevel } from './score'
import { loadValidatedSkills } from './validated'

export interface MatchedItem {
  sourceType: 'scraper' | 'community'
  id: string
  title: string
  company: string | null
  companyLogo: string | null
  roleCategory: string | null
  seniorityLevel: string | null
  skills: string[]
  url: string
  postDate: string | null
  /** Cuántos de tus skills pide la vacante. */
  matchingSkills: number
  /** Cuáles. */
  sharedSkills: string[]
  /** 0 a 100: qué tan bien encaja contigo (rol, skills, nivel y modalidad). */
  matchScore: number
  /** Tus skills que pide la vacante y validaste con examen, con su nivel. */
  validatedSkills: { skill: string; level: ValidationLevel }[]
  /** Qué tan cerca está el rol de la vacante del de la persona. */
  roleFit: 'exact' | 'adjacent' | 'unknown' | 'none'
  /** Cómo encajan nivel y modalidad (para explicar el porcentaje). */
  seniorityFit: string
  modalityFit: string
  modalidad: string | null
}

/** Lo que cambia de una vacante a otra, sin lo que depende de la persona. */
export type PoolItem = Omit<MatchedItem, 'matchingSkills' | 'sharedSkills' | 'matchScore' | 'validatedSkills' | 'roleFit' | 'seniorityFit' | 'modalityFit'>

/** La parte del perfil con la que se puntúa. */
export interface MatchProfile {
  id: string
  role_category: string | null
  seniority: string | null
  skills: string[] | null
  work_modality: string | null
}

function toSkillArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string')
  return []
}

// Las vacantes más recientes de cada fuente: se puntúan en memoria, así no depende de que la vacante tenga justo
// el mismo rol y nivel.
const POOL_SIZE = 600

/**
 * Las vacantes contra las que se puntúa a la gente. Una sola lectura sirve para MUCHAS personas: por eso el cálculo
 * ya no vive en la petición de cada persona sino en `refresh.ts`, que lo hace de fondo.
 */
export async function loadPool(): Promise<PoolItem[]> {
  const [{ data: scraperRows }, { data: communityRows }] = await Promise.all([
    supabase
      .from('scraper_posts')
      .select('id, text, company, company_logo, role_category, seniority_level, skills, url, post_date, created_at, work_modality')
      .eq('post_type', 'vacancy')
      .eq('is_spam', false)
      .order('post_date', { ascending: false })
      .limit(POOL_SIZE),
    supabase
      .from('community_posts')
      .select('id, title, company, company_logo, role_category, seniority_level, skills, slug, created_at, modalidad')
      .eq('type', 'job')
      .order('created_at', { ascending: false })
      .limit(POOL_SIZE),
  ])

  const pool: PoolItem[] = []
  for (const row of scraperRows || []) {
    pool.push({
      sourceType: 'scraper',
      id: row.id,
      title: row.text?.split('\n')[0]?.replace(/^##\s*/, '').substring(0, 150) || 'Vacante sin título',
      company: row.company,
      companyLogo: row.company_logo,
      roleCategory: row.role_category,
      seniorityLevel: row.seniority_level,
      skills: toSkillArray(row.skills),
      url: row.url || '',
      postDate: row.post_date || row.created_at,
      modalidad: row.work_modality ?? null,
    })
  }
  for (const row of communityRows || []) {
    pool.push({
      sourceType: 'community',
      id: row.id,
      title: row.title,
      company: row.company,
      companyLogo: row.company_logo,
      roleCategory: row.role_category,
      seniorityLevel: row.seniority_level,
      skills: toSkillArray(row.skills),
      url: `/vacantes/${row.slug || row.id}`,
      postDate: row.created_at,
      modalidad: row.modalidad ?? null,
    })
  }
  return pool
}

/**
 * Puntúa un perfil contra el pool y devuelve lo que encaja, lo mejor primero; a igual puntaje, lo más reciente.
 * Es una función pura sobre datos ya cargados: no toca la base.
 */
export function scoreAgainstPool(user: MatchProfile, validatedSkills: Record<string, ValidationLevel>, pool: PoolItem[]): MatchedItem[] {
  if (!user.role_category) return []

  const candidate = {
    roleCategory: user.role_category,
    seniority: user.seniority ?? null,
    skills: (user.skills || []).map((skill) => skill.toLowerCase()),
    workModality: user.work_modality ?? null,
    validatedSkills,
  }

  const items: MatchedItem[] = []
  for (const item of pool) {
    const result = scoreMatch(candidate, {
      roleCategory: item.roleCategory,
      seniority: item.seniorityLevel,
      skills: item.skills.map((skill) => skill.toLowerCase()),
      workModality: item.modalidad,
    })
    if (!result.qualifies) continue
    items.push({ ...item, matchingSkills: result.sharedSkills.length, sharedSkills: result.sharedSkills, matchScore: result.score, validatedSkills: result.validatedSkills, roleFit: result.role, seniorityFit: result.seniority, modalityFit: result.modality })
  }

  items.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
    if (b.validatedSkills.length !== a.validatedSkills.length) return b.validatedSkills.length - a.validatedSkills.length
    return new Date(b.postDate ?? 0).getTime() - new Date(a.postDate ?? 0).getTime()
  })
  return items
}

/** Todo el cálculo para UNA persona, leyendo lo que necesite. Es el camino lento: solo cuando no hay nada guardado. */
export async function scoreForUser(user: MatchProfile): Promise<MatchedItem[]> {
  const [validatedSkills, pool] = await Promise.all([loadValidatedSkills(user.id), loadPool()])
  return scoreAgainstPool(user, validatedSkills, pool)
}

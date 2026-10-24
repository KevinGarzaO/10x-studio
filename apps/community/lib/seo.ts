/**
 * Datos y utilidades para el SEO: las páginas de empleos por skill, el sitemap y el
 * JSON-LD de Google for Jobs.
 *
 * Todo se lee del backend (`/api/community/seo/*`), nunca de Supabase: el frontend no
 * habla con la base, y esos endpoints devuelven solo campos públicos (sin contactos).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** La dirección pública del sitio, para canónicos, sitemap y enlaces del JSON-LD. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://avotalent.app').replace(/\/+$/, '')

/** Cada cuánto se vuelve a leer lo que ve un buscador (segundos). */
export const REVALIDATE_SECONDS = 3600

export interface SeoSkill {
  name: string
  label: string
  /** Vacantes activas con ese skill. */
  vacancies: number
}

export interface SeoRole {
  /** La clave del puesto (`ux_ui`). */
  role: string
  /** Lo que va en la dirección (`ux-ui`). */
  slug: string
  label: string
  /** Vacantes activas de ese puesto. */
  vacancies: number
}

export interface SeoVacancy {
  id: string
  slug: string
  title: string
  company: string | null
  company_logo: string | null
  location: string | null
  modalidad: string | null
  seniority_level: string | null
  role_category: string | null
  skills: string[]
  budget: string | null
  created_at: string
  /** Solo en el detalle (`/vacancy/:slug`): HTML sin contacto, y si ya venció. */
  description?: string | null
  expired?: boolean
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/community/seo/${path}`, { next: { revalidate: REVALIDATE_SECONDS } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    // Sin backend (por ejemplo, al compilar) la página se arma vacía y se regenera después.
    return null
  }
}

export async function getSeoSkills(): Promise<SeoSkill[]> {
  return (await get<{ skills: SeoSkill[] }>('skills'))?.skills ?? []
}

export async function getSeoSkill(name: string): Promise<{ name: string; label: string } | null> {
  return (await get<{ skill: { name: string; label: string } }>(`skills/${encodeURIComponent(name)}`))?.skill ?? null
}

export async function getSeoRoles(): Promise<SeoRole[]> {
  return (await get<{ roles: SeoRole[] }>('roles'))?.roles ?? []
}

export async function getSeoRole(slug: string): Promise<{ role: string; slug: string; label: string } | null> {
  return (await get<{ role: { role: string; slug: string; label: string } }>(`roles/${encodeURIComponent(slug)}`))?.role ?? null
}

export async function getSeoVacancies(options: { skill?: string; role?: string; exclude?: string; limit?: number } = {}): Promise<SeoVacancy[]> {
  const params = new URLSearchParams()
  if (options.skill) params.set('skill', options.skill)
  if (options.role) params.set('role', options.role)
  if (options.exclude) params.set('exclude', options.exclude)
  if (options.limit) params.set('limit', String(options.limit))
  return (await get<{ vacancies: SeoVacancy[] }>(`vacancies?${params}`))?.vacancies ?? []
}

export async function getSeoVacancy(slug: string): Promise<SeoVacancy | null> {
  return (await get<{ vacancy: SeoVacancy }>(`vacancy/${encodeURIComponent(slug)}`))?.vacancy ?? null
}

export async function getSeoSitemap(): Promise<{
  skills: { name: string; lastModified: string }[]
  roles: { slug: string; lastModified: string }[]
  vacancies: { slug: string; lastModified: string }[]
}> {
  const sitemap = await get<{ skills?: any[]; roles?: any[]; vacancies?: any[] }>('sitemap')
  return { skills: sitemap?.skills ?? [], roles: sitemap?.roles ?? [], vacancies: sitemap?.vacancies ?? [] }
}

import { ROLE_CATEGORY_LABEL, type RoleCategory } from '@avocado/schemas'
import { modalityFromLabel } from '../vacancies/modality'

/**
 * Las publicaciones de vacantes en LinkedIn: qué vacante se elige y cómo se escribe.
 *
 * Todo es determinista y sin IA: el texto sale de una plantilla llenada con los datos
 * que la vacante ya tiene. Lo que da valor al post es cuánta información real trae
 * (puesto, nivel, modalidad, skills, salario), no el estilo de redacción.
 *
 * Son funciones puras (no tocan la base ni LinkedIn): las usan el publicador, la vista
 * previa y las pruebas.
 */

export interface LinkedInVacancy {
  id: string
  slug: string | null
  title: string
  company: string | null
  location: string | null
  modalidad: string | null
  seniority_level: string | null
  role_category: string | null
  skills: string[]
  /** Salario u oferta económica, tal como la trae la vacante. */
  budget: string | null
  company_logo: string | null
  created_at: string | null
}

/** Lo que se sabe de lo ya publicado, para no repetir empresa ni rol seguidos. */
export interface PostedVacancy {
  company: string | null
  role_category: string | null
  published_at: string
}

const SENIORITY_TEXT: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }

/** Cuántos días no se vuelve a publicar una vacante de la misma empresa. */
export const COMPANY_COOLDOWN_DAYS = 7
/** Cuántas publicaciones recientes se miran para no repetir el mismo rol seguido. */
export const ROLE_MEMORY = 3
/** Cuántos skills caben en el post. */
export const MAX_SKILLS = 5

const known = (value: string | null | undefined): value is string =>
  !!value && value.trim() !== '' && !/no especificado|unknown/i.test(value)

/**
 * Qué tan completa está una vacante: es lo que la hace atractiva como publicación.
 * Más datos reales, más puntos.
 */
export function completeness(vacancy: LinkedInVacancy): number {
  let points = 0
  if (known(vacancy.seniority_level)) points += 2
  if (modalityFromLabel(vacancy.modalidad) !== 'unknown') points += 2
  points += Math.min(vacancy.skills.length, MAX_SKILLS)
  if (known(vacancy.budget)) points += 3
  if (known(vacancy.location)) points += 1
  if (vacancy.company_logo) points += 1
  return points
}

const companyKey = (company: string | null) => (company ?? '').trim().toLowerCase()

/**
 * Elige la vacante de este turno entre las que aún no se publicaron.
 *
 * Reglas, en este orden:
 *  1. No se repite empresa dentro de COMPANY_COOLDOWN_DAYS (si no quedara ninguna otra,
 *     se relaja: es mejor publicar que quedarse callado).
 *  2. Se evita el rol de las últimas ROLE_MEMORY publicaciones, para que el perfil no
 *     parezca un canal de un solo tipo de puesto (también se relaja si no hay opción).
 *  3. Gana la más completa; a igual completitud, la más reciente.
 */
export function pickVacancy(
  candidates: LinkedInVacancy[],
  history: PostedVacancy[],
  now: Date = new Date(),
): LinkedInVacancy | null {
  const usable = candidates.filter((vacancy) => vacancy.slug && known(vacancy.company))
  if (usable.length === 0) return null

  const ordered = [...history].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
  const cooldownFrom = now.getTime() - COMPANY_COOLDOWN_DAYS * 86400000
  const recentCompanies = new Set(
    ordered.filter((posted) => Date.parse(posted.published_at) >= cooldownFrom).map((posted) => companyKey(posted.company)),
  )
  const recentRoles = new Set(ordered.slice(0, ROLE_MEMORY).map((posted) => posted.role_category))

  const byCompany = usable.filter((vacancy) => !recentCompanies.has(companyKey(vacancy.company)))
  const pool1 = byCompany.length > 0 ? byCompany : usable
  const byRole = pool1.filter((vacancy) => !recentRoles.has(vacancy.role_category))
  const pool = byRole.length > 0 ? byRole : pool1

  return [...pool].sort(
    (a, b) => completeness(b) - completeness(a) || Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
  )[0]
}

/** El enlace de la vacante, con el origen marcado para saber qué registros trae LinkedIn. */
export function vacancyUrl(siteUrl: string, slug: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'vacante-auto',
    utm_content: slug,
  })
  return `${base}/vacantes/${slug}?${params.toString()}`
}

const HASHTAGS: Record<string, string[]> = {
  frontend: ['#Frontend', '#Desarrollo'],
  backend: ['#Backend', '#Desarrollo'],
  fullstack: ['#FullStack', '#Desarrollo'],
  mobile: ['#Mobile', '#Desarrollo'],
  devops: ['#DevOps', '#Cloud'],
  data_engineer: ['#DataEngineering', '#Datos'],
  data_scientist: ['#DataScience', '#IA'],
  qa: ['#QA', '#Testing'],
  ux_ui: ['#UX', '#Diseño'],
  marketing: ['#Marketing'],
  customer_support: ['#CustomerSuccess', '#Soporte'],
  product: ['#Producto', '#ProductManagement'],
  recursos_humanos: ['#RecursosHumanos', '#Talento'],
  administracion: ['#Administración'],
  finanzas: ['#Finanzas', '#Contabilidad'],
  ventas: ['#Ventas', '#NegociosB2B'],
  legal: ['#Legal', '#Derecho'],
}

function hashtagsFor(vacancy: LinkedInVacancy): string[] {
  const tags = [...(HASHTAGS[vacancy.role_category ?? ''] ?? []), '#Empleo']
  const modality = modalityFromLabel(vacancy.modalidad)
  if (modality === 'remote') tags.push('#TrabajoRemoto')
  return [...new Set(tags)].slice(0, 4)
}

const OPENERS: ((title: string, company: string) => string)[] = [
  (title, company) => `🚀 Se busca ${title} en ${company}`,
  (title, company) => `💼 ${company} está contratando: ${title}`,
  (title, company) => `🔎 Nueva vacante: ${title} en ${company}`,
  (title, company) => `✨ ${company} abre una posición de ${title}`,
]

/** La frase que invita a registrarse; es el gancho de todo el post. */
const CALL_TO_ACTION = '¿Qué tan bien encajas? Regístrate gratis en AvoTalent y ve tu % de match con tus skills.'

/** Cuántas ubicaciones se escriben cuando la oferta trae varias ("SF • NY • Toronto"). */
const MAX_LOCATIONS = 2

/**
 * "Ciudad · Modalidad" sin repetir ("Remoto · Remoto") y con a lo más dos ubicaciones:
 * varias ofertas traen listas largas de ciudades.
 */
export function placeOf(vacancy: LinkedInVacancy): string {
  const cities = known(vacancy.location)
    ? [...new Set(vacancy.location.split(/[•;|]/).map((part) => part.trim()).filter(Boolean))]
    : []
  const shown = cities.slice(0, MAX_LOCATIONS).join(' / ')
  const extra = cities.length > MAX_LOCATIONS ? ` +${cities.length - MAX_LOCATIONS}` : ''
  const modality = modalityFromLabel(vacancy.modalidad) !== 'unknown' ? vacancy.modalidad!.trim() : ''

  const parts = [shown ? `${shown}${extra}` : '', modality].filter(Boolean)
  // La misma palabra dos veces ("Remoto · Remoto") se deja una sola.
  return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(' · ')
}

/**
 * El texto del post. Una línea con un dato vacío no se escribe: nunca dice "Nivel: no
 * especificado".
 *
 * @param variant  qué apertura usar; el publicador pasa cuántas publicaciones van, así se
 *                 alternan sin azar.
 */
export function buildPostText(
  vacancy: LinkedInVacancy,
  url: string,
  variant = 0,
  skillLabels: Record<string, string> = {},
): string {
  const company = (vacancy.company ?? '').trim()
  const opener = OPENERS[Math.abs(variant) % OPENERS.length](vacancy.title.trim(), company)
  const place = placeOf(vacancy)

  const role = ROLE_CATEGORY_LABEL[vacancy.role_category as RoleCategory]
  const level = SENIORITY_TEXT[vacancy.seniority_level ?? '']
  const profile = [role ? `Puesto: ${role}` : null, level ? `Nivel: ${level}` : null].filter(Boolean).join(' · ')

  // Con el nombre bonito del catálogo ("Go", "UI/UX Design"), no el identificador interno.
  const skills = vacancy.skills.slice(0, MAX_SKILLS).map((name) => skillLabels[name] ?? name)

  const details = [
    place ? `📍 ${place}` : null,
    profile ? `🎯 ${profile}` : null,
    skills.length > 0 ? `🧩 Skills: ${skills.join(' · ')}` : null,
    known(vacancy.budget) ? `💰 ${vacancy.budget.trim()}` : null,
  ].filter(Boolean)

  // Bloques separados por una línea en blanco; un bloque sin datos no se escribe.
  return [opener, details.join('\n'), CALL_TO_ACTION, `👉 ${url}`, hashtagsFor(vacancy).join(' ')]
    .filter((block) => block !== '')
    .join('\n\n')
}

/** Título y descripción de la tarjeta del enlace (lo que LinkedIn muestra bajo el post). */
export function cardFor(vacancy: LinkedInVacancy): { title: string; description: string } {
  const role = ROLE_CATEGORY_LABEL[vacancy.role_category as RoleCategory]
  const parts = [
    role,
    SENIORITY_TEXT[vacancy.seniority_level ?? ''],
    known(vacancy.location) ? vacancy.location.trim() : null,
    modalityFromLabel(vacancy.modalidad) !== 'unknown' ? vacancy.modalidad!.trim() : null,
  ].filter(Boolean)
  return {
    title: `${vacancy.title.trim()} — ${(vacancy.company ?? '').trim()}`,
    description: `${parts.join(' · ')}${parts.length ? '. ' : ''}Regístrate en AvoTalent y ve tu match.`,
  }
}

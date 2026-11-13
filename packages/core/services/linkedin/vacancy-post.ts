import { ROLE_CATEGORY_LABEL, type RoleCategory } from '@avotalent/schemas'
import { modalityFromLabel } from '../vacancies/modality'
import { ROLE_FOCUS } from '../audience/role-focus'

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
/**
 * Qué tan lejos del mejor puntaje se busca variedad (en puntos de `publishScore`): primero entre las que están a 2 puntos de la mejor,
 * y solo si ahí no hay una que cumpla las reglas de variedad se abre a 4 y luego a 8. Así siempre se publica una de las mejores.
 */
export const TOP_BANDS = [2, 4, 8]

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

// El foco de roles vive en services/audience/role-focus.ts: lo comparten LinkedIn y los temas en tendencia.
export { ROLE_FOCUS }

/**
 * Qué tan buena candidata es una vacante para publicarse: su completitud, más lo que sabemos que
 * atrae a esta audiencia (el rol del foco, nivel senior o semi senior, y trabajo remoto).
 */
export function publishScore(vacancy: LinkedInVacancy, focus: Record<string, number> = ROLE_FOCUS): number {
  const level = vacancy.seniority_level === 'senior' || vacancy.seniority_level === 'semi_senior' ? 2 : 0
  const remote = modalityFromLabel(vacancy.modalidad) === 'remote' ? 2 : 0
  return completeness(vacancy) + (focus[vacancy.role_category ?? ''] ?? 0) * 2 + level + remote
}

const companyKey = (company: string | null) => (company ?? '').trim().toLowerCase()

/**
 * Elige la vacante de este turno entre las que aún no se publicaron.
 *
 * SIEMPRE una de las mejores: se parte del mejor `publishScore` y se mira primero a las vacantes que están a TOP_BANDS[0] puntos
 * de él; solo si ahí no hay ninguna que cumpla las reglas, se abre la banda (a 4 y luego a 8 puntos), nunca antes. Dentro de la banda:
 *  1. No se repite empresa dentro de COMPANY_COOLDOWN_DAYS (esta regla es la más firme: se abre la banda antes de repetir empresa).
 *  2. Se prefiere no repetir el rol de las últimas ROLE_MEMORY publicaciones, para que el perfil no parezca un canal de un solo
 *     tipo de puesto; si todas las mejores son de ese rol, gana la mejor (con 4 al día, ser top pesa más que alternar el rol).
 *  3. Gana la de mayor `publishScore`; a igual puntaje, la más reciente.
 * Si ni abriendo las bandas hay una que cumpla, se relajan las reglas: es mejor publicar que quedarse callado.
 *
 * Y antes de todo: solo entran las vacantes de los roles del foco (`ROLE_FOCUS`).
 */
export function pickVacancy(
  candidates: LinkedInVacancy[],
  history: PostedVacancy[],
  now: Date = new Date(),
  focus: Record<string, number> = ROLE_FOCUS,
): LinkedInVacancy | null {
  const usable = candidates.filter((vacancy) => vacancy.slug && known(vacancy.company) && vacancy.role_category && vacancy.role_category in focus)
  if (usable.length === 0) return null

  const ordered = [...history].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
  const cooldownFrom = now.getTime() - COMPANY_COOLDOWN_DAYS * 86400000
  const recentCompanies = new Set(
    ordered.filter((posted) => Date.parse(posted.published_at) >= cooldownFrom).map((posted) => companyKey(posted.company)),
  )
  const recentRoles = new Set(ordered.slice(0, ROLE_MEMORY).map((posted) => posted.role_category))

  const score = (vacancy: LinkedInVacancy) => publishScore(vacancy, focus)
  const best = (list: LinkedInVacancy[]) =>
    [...list].sort((a, b) => score(b) - score(a) || Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))[0]
  const companyOk = (vacancy: LinkedInVacancy) => !recentCompanies.has(companyKey(vacancy.company))
  const roleOk = (vacancy: LinkedInVacancy) => !recentRoles.has(vacancy.role_category)

  const topScore = Math.max(...usable.map(score))
  for (const band of TOP_BANDS) {
    const near = usable.filter((vacancy) => score(vacancy) >= topScore - band)
    const varied = near.filter((vacancy) => companyOk(vacancy) && roleOk(vacancy))
    if (varied.length > 0) return best(varied)
    const newCompany = near.filter(companyOk)
    if (newCompany.length > 0) return best(newCompany)
  }

  // Ninguna cumple ni en la banda más ancha: se relaja (primero el rol, luego la empresa).
  const byCompany = usable.filter(companyOk)
  const pool1 = byCompany.length > 0 ? byCompany : usable
  const byRole = pool1.filter(roleOk)
  return best(byRole.length > 0 ? byRole : pool1)
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

/**
 * El texto con pregunta del experimento de formato (ver experiment.ts): abre hablándole a quien busca ese puesto, en vez de anunciar la
 * vacante, y la invitación a registrarse llega antes de postularse. Misma información y mismo enlace; solo cambia cómo abre y cierra.
 */
function questionOpener(title: string, company: string, role: string | undefined): string {
  return role ? `🎯 ¿Buscas tu próximo reto como ${role}? ${company} abre la vacante de ${title}` : `🎯 ¿Te ves como ${title}? ${company} está contratando`
}
const QUESTION_CALL_TO_ACTION = 'Antes de postularte, mira cuánto encajas: regístrate gratis en AvoTalent y ve tu % de match con tus skills.'

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
  style: 'control' | 'pregunta' = 'control',
): string {
  const company = (vacancy.company ?? '').trim()
  const place = placeOf(vacancy)

  const role = ROLE_CATEGORY_LABEL[vacancy.role_category as RoleCategory]
  const opener = style === 'pregunta'
    ? questionOpener(vacancy.title.trim(), company, role)
    : OPENERS[Math.abs(variant) % OPENERS.length](vacancy.title.trim(), company)
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
  return [opener, details.join('\n'), style === 'pregunta' ? QUESTION_CALL_TO_ACTION : CALL_TO_ACTION, `👉 ${url}`, hashtagsFor(vacancy).join(' ')]
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

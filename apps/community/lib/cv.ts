import {
  cvSchema,
  WEB_URL,
  CV_LIMITS,
  type Cv,
  type CvExperience,
  type CvEducation,
  type CvLanguage,
  type CvCertification,
  type CvProject,
} from '@avocado/schemas'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2024-03" -> "mar 2024". Lo que no tiene ese formato se devuelve tal cual. */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return value
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${month} ${match[1]}` : value
}

/** "mar 2022 – jun 2024", o "mar 2022 – Actual" si sigue en ese trabajo. */
export function formatPeriod(start: string, end: string | null, currentLabel = 'Actual'): string {
  const from = formatMonth(start)
  const to = end === null ? currentLabel : formatMonth(end)
  return from ? `${from} – ${to}` : to
}

/** "2014 – 2018", o "2014 – Actual" si sigue estudiando. */
export function formatYears(start: string, end: string | null): string {
  return `${start} – ${end ?? 'Actual'}`
}

/** Lo más reciente primero: lo que importa en un CV es lo último que hizo. */
export function newestFirst(jobs: CvExperience[]): CvExperience[] {
  return [...jobs].sort((a, b) => {
    // El trabajo actual (sin fin) va antes que cualquiera que ya terminó.
    const aEnd = a.endDate ?? '9999-12'
    const bEnd = b.endDate ?? '9999-12'
    return bEnd.localeCompare(aEnd) || b.startDate.localeCompare(a.startDate)
  })
}

export function studiesNewestFirst(studies: CvEducation[]): CvEducation[] {
  return [...studies].sort((a, b) => (b.endYear ?? '9999').localeCompare(a.endYear ?? '9999') || b.startYear.localeCompare(a.startYear))
}

/**
 * Un enlace seguro para mostrar: siempre http(s). Si le falta el protocolo se lo
 * pone, y lo que no sea una dirección web (por ejemplo `javascript:`) devuelve
 * null y no se renderiza como enlace.
 */
export function toSafeUrl(value: string | null | undefined): string | null {
  const url = (value || '').trim()
  if (!url || !WEB_URL.test(url)) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

// --- entradas nuevas del formulario (en blanco: se validan al guardar, no al agregar)

export const newExperience = (): CvExperience => ({
  company: '',
  position: '',
  location: '',
  startDate: '',
  endDate: null,
  description: '',
})

export const newEducation = (): CvEducation => ({
  institution: '',
  degree: '',
  field: '',
  startYear: '',
  endYear: null,
})

export const newLanguage = (): CvLanguage => ({ name: '', level: 'intermedio' })
export const newCertification = (): CvCertification => ({ name: '', issuer: '', year: '' })
export const newProject = (): CvProject => ({ name: '', url: '', description: '' })

const SECTION_NAMES: Record<string, string> = {
  summary: 'Resumen',
  contactEmail: 'Contacto',
  phone: 'Contacto',
  linkedinUrl: 'Contacto',
  experience: 'Experiencia',
  education: 'Educación',
  languages: 'Idiomas',
  certifications: 'Certificaciones',
  projects: 'Proyectos',
}

/**
 * Valida el CV con el mismo esquema que el backend y, si falla, devuelve un mensaje
 * que dice DÓNDE: "Experiencia 2: Falta la empresa". Así la persona sabe a qué
 * entrada ir sin buscar.
 */
export function validateCv(cv: Cv): string | null {
  const parsed = cvSchema.safeParse(cv)
  if (parsed.success) return null

  const issue = parsed.error.issues[0]
  const [section, index] = issue.path
  const name = SECTION_NAMES[String(section)] || 'CV'
  const where = typeof index === 'number' ? `${name} ${index + 1}` : name
  return `${where}: ${issue.message}`
}

export { CV_LIMITS }

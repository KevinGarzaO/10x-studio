import { z } from 'zod'

/**
 * El CV de una persona: lo que va más allá del perfil (puesto, nivel, skills,
 * ubicación), que ya vive en `users`. Se guarda como un documento (users.cv) y se
 * valida aquí, con el mismo esquema en el backend y en el formulario.
 *
 * Todo es opcional a propósito: un CV se llena de a poco y no bloquea a nadie. La
 * obligatoriedad vive en el perfil, no aquí.
 */

export const CV_LANGUAGE_LEVELS = ['basico', 'intermedio', 'avanzado', 'nativo'] as const
export type CvLanguageLevel = (typeof CV_LANGUAGE_LEVELS)[number]

export const CV_LANGUAGE_LEVEL_LABEL: Record<CvLanguageLevel, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  nativo: 'Nativo',
}

/** Límites: un CV de varias páginas no es un CV, y acota lo que se guarda por cuenta. */
export const CV_LIMITS = {
  experience: 20,
  education: 10,
  languages: 10,
  certifications: 20,
  projects: 10,
} as const

const text = (max: number) => z.string().trim().max(max)
const required = (max: number, message: string) => z.string().trim().min(1, message).max(max)

/** Texto opcional: vacío se guarda como cadena vacía, nunca como null, para que el formulario sea simple. */
const optional = (max: number) => text(max).default('')

/** Mes y año, "2024-03". */
const MONTH = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/
const month = z.string().regex(MONTH, 'Usa el formato AAAA-MM')

const YEAR = /^(19|20)\d{2}$/
const year = z.string().regex(YEAR, 'Usa un año de 4 dígitos')

/** Un enlace opcional: vacío o una dirección web. */
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(value), 'No parece un enlace válido')
  .default('')

export const cvExperienceSchema = z
  .object({
    company: required(120, 'Falta la empresa'),
    position: required(120, 'Falta el puesto'),
    location: optional(120),
    startDate: month,
    /** null = es su trabajo actual. */
    endDate: month.nullable().default(null),
    description: optional(1500),
  })
  .refine((job) => job.endDate === null || job.endDate >= job.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  })

export const cvEducationSchema = z
  .object({
    institution: required(150, 'Falta la institución'),
    degree: required(150, 'Falta el título o grado'),
    field: optional(150),
    startYear: year,
    /** null = sigue estudiando. */
    endYear: year.nullable().default(null),
  })
  .refine((study) => study.endYear === null || study.endYear >= study.startYear, {
    message: 'El año de fin no puede ser anterior al de inicio',
    path: ['endYear'],
  })

export const cvLanguageSchema = z.object({
  name: required(60, 'Falta el idioma'),
  level: z.enum(CV_LANGUAGE_LEVELS),
})

export const cvCertificationSchema = z.object({
  name: required(150, 'Falta el nombre de la certificación'),
  issuer: optional(150),
  year: z.union([year, z.literal('')]).default(''),
})

export const cvProjectSchema = z.object({
  name: required(120, 'Falta el nombre del proyecto'),
  url: optionalUrl,
  description: optional(800),
})

export const cvSchema = z.object({
  summary: optional(1200),
  /** Datos de contacto que la persona decide mostrar en su CV. */
  contactEmail: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'No parece un correo válido')
    .default(''),
  phone: optional(30),
  linkedinUrl: optionalUrl,
  experience: z.array(cvExperienceSchema).max(CV_LIMITS.experience).default([]),
  education: z.array(cvEducationSchema).max(CV_LIMITS.education).default([]),
  languages: z.array(cvLanguageSchema).max(CV_LIMITS.languages).default([]),
  certifications: z.array(cvCertificationSchema).max(CV_LIMITS.certifications).default([]),
  projects: z.array(cvProjectSchema).max(CV_LIMITS.projects).default([]),
})

/** Lo que se guarda y se devuelve: todo presente, con sus valores por omisión. */
export type Cv = z.infer<typeof cvSchema>
export type CvExperience = z.infer<typeof cvExperienceSchema>
export type CvEducation = z.infer<typeof cvEducationSchema>
export type CvLanguage = z.infer<typeof cvLanguageSchema>
export type CvCertification = z.infer<typeof cvCertificationSchema>
export type CvProject = z.infer<typeof cvProjectSchema>

/** Lo que cada formulario envía: el CV y si es visible en línea. */
export const cvPayloadSchema = z.object({
  cv: cvSchema,
  /** ¿Cualquiera con el enlace puede ver el CV? Por defecto no. */
  public: z.boolean().default(false),
})

/** Un CV vacío y válido: el punto de partida del formulario. */
export function emptyCv(): Cv {
  return cvSchema.parse({})
}

/**
 * Lee un CV guardado, venga como venga: una cuenta sin CV (`{}` o null) o un
 * documento viejo al que le falten campos nuevos no deben romper nada.
 */
export function parseStoredCv(value: unknown): Cv {
  const parsed = cvSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : emptyCv()
}

/** ¿Tiene algo escrito? Sirve para no mostrar un CV vacío como si estuviera hecho. */
export function cvHasContent(cv: Cv): boolean {
  return (
    cv.summary !== '' ||
    cv.experience.length > 0 ||
    cv.education.length > 0 ||
    cv.languages.length > 0 ||
    cv.certifications.length > 0 ||
    cv.projects.length > 0
  )
}

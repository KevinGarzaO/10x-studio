import { z } from 'zod'

// Estos tres catálogos vivían duplicados entre el backend
// (users.routes.ts VALID_SENIORITY / VALID_ROLE_CATEGORY) y el frontend
// (apps/community/lib/profile-options.ts). Aquí son la única fuente.

export const SENIORITY = ['junior', 'semi_senior', 'senior'] as const

export const ROLE_CATEGORY = [
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'data_engineer',
  'data_scientist',
  'qa',
  'ux_ui',
  'marketing',
  'customer_support',
  'product',
  'recursos_humanos',
  'administracion',
  'finanzas',
  'otro',
] as const

/**
 * El nombre visible de cada categoría de rol, en español. Es también el PUESTO de
 * la persona: ya no se escribe un título aparte, se elige de este listado, para
 * que perfiles y vacantes hablen el mismo idioma y el match no dependa de cómo
 * escribió cada quien.
 */
export type RoleCategory = (typeof ROLE_CATEGORY)[number]

export const ROLE_CATEGORY_LABEL: Record<RoleCategory, string> = {
  frontend: 'Desarrollo Frontend',
  backend: 'Desarrollo Backend',
  fullstack: 'Desarrollo Full Stack',
  mobile: 'Desarrollo Móvil',
  devops: 'DevOps e Infraestructura',
  data_engineer: 'Ingeniería de Datos',
  data_scientist: 'Ciencia de Datos e IA',
  qa: 'QA y Pruebas',
  ux_ui: 'Diseño UX/UI',
  marketing: 'Marketing',
  customer_support: 'Atención al Cliente',
  product: 'Producto',
  recursos_humanos: 'Recursos Humanos',
  administracion: 'Administración',
  finanzas: 'Finanzas y Contabilidad',
  otro: 'Otro',
}

export const WORK_MODALITY = ['Remoto', 'Híbrido', 'Presencial'] as const

export type Seniority = (typeof SENIORITY)[number]
export type WorkModality = (typeof WORK_MODALITY)[number]

/** Los dos tipos de cuenta (FR-001). El valor almacenado, no la prosa. */
export const ACCOUNT_TYPES = ['candidate', 'company'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Un texto opcional vacío se guarda como null, no como cadena vacía. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullish()

/**
 * approvedSkillNames debe ser la lista vigente de skills aprobados
 * (skills.name en la DB). Se recibe como argumento para que este paquete no
 * dependa de la base de datos — mismo patrón que buildExamQuestionSchema.
 *
 * Los campos obligatorios lo son porque el perfil de un candidato no se
 * considera completo sin ellos (FR-014, FR-026, FR-027). Los campos
 * privilegiados (accountType, isSuperadmin, roles, companySlug) no están en el
 * schema a propósito: Zod los descarta, así que no pueden llegar a la DB por
 * este camino (FR-004, FR-005).
 */
export function buildCandidateProfileSchema(approvedSkillNames: string[]) {
  return z
    .object({
      roleCategory: z.enum(ROLE_CATEGORY),
      seniority: z.enum(SENIORITY),
      skills: z
        .array(z.string().trim().min(1))
        .min(1, 'Elige al menos un skill')
        .refine((skills) => new Set(skills).size === skills.length, {
          message: 'No repitas un skill',
        })
        .refine((skills) => skills.every((skill) => approvedSkillNames.includes(skill)), {
          message: 'Todos los skills deben estar en el catálogo aprobado',
        }),
      location: z.string().trim().min(1, 'La ubicación es obligatoria').max(100),
      workModality: z.enum(WORK_MODALITY),
      displayName: optionalText(80),
      bio: optionalText(1000),
      website: optionalText(200),
      githubUrl: optionalText(200),
    })
    // El puesto sale del listado de roles: no se captura un título libre, se deriva
    // siempre de la categoría elegida. Cualquier `title` que llegue se descarta.
    .transform((profile) => ({ ...profile, title: ROLE_CATEGORY_LABEL[profile.roleCategory] }))
}

export type CandidateProfileInput = z.infer<ReturnType<typeof buildCandidateProfileSchema>>

/**
 * El primer skill de `skills` que no está aprobado. Sirve para señalar el
 * culpable en el error del formulario y para la conversión de perfiles
 * heredados (FR-015).
 */
export function firstUnapprovedSkill(
  skills: string[],
  approvedSkillNames: string[],
): string | null {
  return skills.find((skill) => !approvedSkillNames.includes(skill)) ?? null
}

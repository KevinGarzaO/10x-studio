import { ROLE_CATEGORY } from '@avocado/schemas'

/**
 * REGLA DE NEGOCIO: una vacante solo entra al feed si está ligada a los catálogos.
 *
 * El feed, "Para ti", los reportes de huecos y el match entre empresas y candidatos
 * dependen de que cada vacante diga de qué ROL es y qué SKILLS del catálogo pide. Una
 * vacante que no lo dice no se puede cruzar con nadie: solo ensucia la información.
 * Por eso no se guarda; y la que ya estaba guardada sin esos datos se elimina de la
 * fuente (el área de paso del scraper), en vez de acumularse.
 *
 * Esta es la ÚNICA definición de "vacante válida". La hacen cumplir, cada una por su
 * lado: el ingreso del scraper (insertPost), la promoción al feed (sync), la creación
 * manual (POST /posts) y un trigger de la base de datos que no deja saltársela. Una
 * prueba mantiene el trigger y esta regla en el mismo sitio.
 *
 * Qué se exige:
 *  - título, empresa y enlace para postularse (sin esos datos no hay qué mostrar);
 *  - un ROL del catálogo (y no "otro", que dice que no se sabe);
 *  - al menos un SKILL, y todos del catálogo.
 *
 * El nivel, la modalidad y la ubicación NO son obligatorios: muchas ofertas no los
 * dicen, y el match sabe tratarlos como "no se sabe". Si el negocio decide exigirlos,
 * se cambia aquí (y en el trigger) y nada más.
 */
export const PUBLISH_RULE = {
  minSkills: 1,
  requireSeniority: false,
  requireModality: false,
} as const

export type RejectReason =
  | 'no_title'
  | 'no_company'
  | 'no_apply_url'
  | 'no_role'
  | 'unknown_role'
  | 'no_skills'
  | 'unknown_skill'
  | 'no_seniority'
  | 'no_modality'

/** Lo que se le dice a quien opera el sistema. */
export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  no_title: 'sin título',
  no_company: 'sin empresa',
  no_apply_url: 'sin enlace para postularse',
  no_role: 'sin rol',
  unknown_role: 'rol que no está en el catálogo',
  no_skills: 'sin skills',
  unknown_skill: 'skill que no está en el catálogo',
  no_seniority: 'sin nivel',
  no_modality: 'sin modalidad',
}

export interface VacancyCandidate {
  title: string | null | undefined
  company: string | null | undefined
  applyUrl: string | null | undefined
  roleCategory: string | null | undefined
  skills: string[]
  seniority?: string | null
  modality?: string | null
}

export interface PublishVerdict {
  valid: boolean
  /** Por qué no pasa; vacío si pasa. */
  reasons: RejectReason[]
}

/** Los roles con los que se puede ligar una vacante: todos menos "otro". */
export const VACANCY_ROLES: readonly string[] = ROLE_CATEGORY.filter((role) => role !== 'otro')

const blank = (value: string | null | undefined) => !value || value.trim() === ''

/**
 * @param skillCatalog los nombres de los skills del catálogo; si no se da, solo se
 *   exige que haya skills (quien llama ya los sacó del catálogo).
 */
export function evaluateVacancy(
  vacancy: VacancyCandidate,
  skillCatalog?: ReadonlySet<string>,
  rule: typeof PUBLISH_RULE = PUBLISH_RULE,
): PublishVerdict {
  const reasons: RejectReason[] = []

  if (blank(vacancy.title)) reasons.push('no_title')
  if (blank(vacancy.company)) reasons.push('no_company')
  if (blank(vacancy.applyUrl)) reasons.push('no_apply_url')

  if (blank(vacancy.roleCategory)) reasons.push('no_role')
  else if (!VACANCY_ROLES.includes(vacancy.roleCategory!)) reasons.push('unknown_role')

  if (vacancy.skills.length < rule.minSkills) reasons.push('no_skills')
  else if (skillCatalog && vacancy.skills.some((skill) => !skillCatalog.has(skill))) reasons.push('unknown_skill')

  if (rule.requireSeniority && blank(vacancy.seniority)) reasons.push('no_seniority')
  if (rule.requireModality && (blank(vacancy.modality) || vacancy.modality === 'unknown' || vacancy.modality === 'No especificado')) {
    reasons.push('no_modality')
  }

  return { valid: reasons.length === 0, reasons }
}

/** Cuenta los rechazos por motivo (el primero de cada vacante), para los registros. */
export function tallyRejections(verdicts: PublishVerdict[]): Partial<Record<RejectReason, number>> {
  const counts: Partial<Record<RejectReason, number>> = {}
  for (const verdict of verdicts) {
    const reason = verdict.reasons[0]
    if (reason) counts[reason] = (counts[reason] ?? 0) + 1
  }
  return counts
}

export function describeRejections(counts: Partial<Record<RejectReason, number>>): string {
  const parts = Object.entries(counts).map(([reason, n]) => `${REJECT_REASON_LABEL[reason as RejectReason]}: ${n}`)
  return parts.length > 0 ? parts.join(', ') : 'ninguna'
}

import { evaluateVacancy, locationFromText, tallyRejections, type PublishVerdict, type RejectReason } from './publish-rule'

/** Una vacante ya publicada en el feed, tal como se guarda en community_posts. */
export interface PublishedVacancy {
  id: string
  title: string | null
  company: string | null
  source_url: string | null
  location?: string | null
  original_text?: string | null
  role_category: string | null
  skills: unknown
}

export interface CleanupPlan {
  /** Cumplen la regla: no se tocan. */
  keep: string[]
  /** No cumplen y nadie interactuó con ellas: se eliminan. */
  remove: string[]
  /** No cumplen pero tienen comentarios o guardados: se conservan y se avisan. */
  protectedInvalid: string[]
  rejections: Partial<Record<RejectReason, number>>
}

const asSkills = (skills: unknown): string[] =>
  Array.isArray(skills) ? skills.filter((skill): skill is string => typeof skill === 'string') : []

/**
 * Decide qué hacer con las vacantes publicadas. Una vacante que no cumple la regla se
 * elimina, salvo que ya tenga comentarios o guardados: borrarla se llevaría la
 * conversación y lo guardado de personas reales. Esas se dejan y se reportan.
 */
export function planCleanup(
  vacancies: PublishedVacancy[],
  skillCatalog: ReadonlySet<string>,
  interacted: ReadonlySet<string>,
  options: { keepInvalid?: boolean } = {},
): CleanupPlan {
  const plan: CleanupPlan = { keep: [], remove: [], protectedInvalid: [], rejections: {} }
  const invalid: PublishVerdict[] = []

  for (const vacancy of vacancies) {
    const verdict = evaluateVacancy(
      {
        title: vacancy.title,
        company: vacancy.company,
        applyUrl: vacancy.source_url,
        location: vacancy.location ?? locationFromText(vacancy.original_text),
        roleCategory: vacancy.role_category,
        skills: asSkills(vacancy.skills),
      },
      skillCatalog,
    )

    if (verdict.valid) {
      plan.keep.push(vacancy.id)
      continue
    }
    invalid.push(verdict)
    if (options.keepInvalid || interacted.has(vacancy.id)) plan.protectedInvalid.push(vacancy.id)
    else plan.remove.push(vacancy.id)
  }

  plan.rejections = tallyRejections(invalid)
  return plan
}

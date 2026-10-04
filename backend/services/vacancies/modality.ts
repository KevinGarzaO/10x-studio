/**
 * La modalidad de una vacante, en el mismo vocabulario con el que el scraper ya la
 * guarda (`scraper_posts.work_modality`): remote | hybrid | onsite | unknown.
 *
 * Más de la mitad llega como "unknown" porque la fuente no la declara, pero el texto
 * muchas veces sí la dice ("100% remote", "modalidad híbrida"). Lo que la fuente
 * declara manda; el texto solo rellena lo desconocido.
 */

export type VacancyModality = 'remote' | 'hybrid' | 'onsite' | 'unknown'

const REMOTE = /(?<![\p{L}\p{N}_])(fully remote|100% remote|remote[- ]first|remote position|remote role|remoto|trabajo remoto|home office|work from home|teletrabajo|remote)(?![\p{L}\p{N}_])/iu
const HYBRID = /(?<![\p{L}\p{N}_])(hybrid|h[ií]brid[oa]|modalidad h[ií]brida)(?![\p{L}\p{N}_])/iu
const ONSITE = /(?<![\p{L}\p{N}_])(on[- ]?site|presencial|in[- ]office|in[- ]person|en oficina)(?![\p{L}\p{N}_])/iu

const KNOWN: VacancyModality[] = ['remote', 'hybrid', 'onsite']

export function inferModality(
  declared: string | null | undefined,
  location: string | null | undefined,
  text: string,
): VacancyModality {
  const given = (declared || '').toLowerCase() as VacancyModality
  if (KNOWN.includes(given)) return given

  // Lo híbrido se revisa primero: "hybrid, 3 days remote" no es remoto.
  const haystack = `${location || ''}\n${text}`
  if (HYBRID.test(haystack)) return 'hybrid'
  if (ONSITE.test(haystack)) return 'onsite'
  if (REMOTE.test(location || '') || REMOTE.test(text)) return 'remote'
  return 'unknown'
}

/** El nombre visible en español, con el que se guarda `community_posts.modalidad`. */
export const MODALITY_LABEL: Record<VacancyModality, string> = {
  remote: 'Remoto',
  hybrid: 'Híbrido',
  onsite: 'Presencial',
  unknown: 'No especificado',
}

/**
 * Lo que una persona elige ("Remoto", "Híbrido", "Presencial") o lo que guarda una
 * vacante publicada ("No especificado"), en el vocabulario de arriba.
 */
export function modalityFromLabel(label: string | null | undefined): VacancyModality {
  switch ((label || '').toLowerCase()) {
    case 'remoto':
    case 'remote':
      return 'remote'
    case 'híbrido':
    case 'hibrido':
    case 'hybrid':
      return 'hybrid'
    case 'presencial':
    case 'onsite':
      return 'onsite'
    default:
      return 'unknown'
  }
}

import { PUBLICATION_SLOTS } from '../analytics/schedule'

/**
 * Experimento de formato de las publicaciones de LinkedIn (backend/sql/linkedin-experiments-migration.sql).
 *
 * Las 3 primeras publicaciones del día no cambian. La CUARTA (la de las 18:30) alterna día con día entre el texto de siempre y un texto con
 * gancho en forma de pregunta; cada publicación guarda su `format` para poder comparar después cuánta gente trae cada uno. Se compara
 * dentro de la misma hora (la cuarta), así que la hora del día no confunde el resultado.
 *
 * Con una publicación de prueba al día y dos formatos, 10 por formato son unas 3 semanas. Menos que eso es ruido: la pantalla lo dice.
 */
export const EXPERIMENT_NAME = 'gancho_slot4'
/** Cuántas publicaciones por formato hacen falta antes de empezar a comparar. */
export const MIN_POSTS_PER_FORMAT = 10

export const FORMATS = ['texto_control', 'texto_pregunta'] as const
export type PostFormat = (typeof FORMATS)[number]
export type PostStyle = 'control' | 'pregunta'

export const FORMAT_LABEL: Record<string, string> = {
  texto_control: 'Texto de siempre',
  texto_pregunta: 'Texto con pregunta',
}

const MONTERREY_OFFSET_MS = 6 * 3600 * 1000

/** La publicación del día que corresponde a esta hora (1 a 4): cuántos horarios de publicación ya empezaron en Monterrey. Mínimo 1. */
export function slotOf(now: Date): number {
  const local = new Date(now.getTime() - MONTERREY_OFFSET_MS)
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  const started = PUBLICATION_SLOTS.filter((slot) => slot.hour * 60 + slot.minute <= minutes).length
  return Math.min(Math.max(started, 1), PUBLICATION_SLOTS.length)
}

/** El número del día en Monterrey (para alternar sin azar: días pares texto de siempre, impares con pregunta). */
function dayNumber(now: Date): number {
  return Math.floor((now.getTime() - MONTERREY_OFFSET_MS) / 86_400_000)
}

export interface Assignment { slot: number; experiment: string | null; format: PostFormat; style: PostStyle }

/**
 * Qué formato toca ahora. Solo la última publicación del día participa en el experimento y alterna por día; las demás van con el texto de
 * siempre y sin experimento. Pura y sin azar: el mismo momento da siempre la misma respuesta.
 */
export function assignFormat(now: Date = new Date()): Assignment {
  const slot = slotOf(now)
  if (slot !== PUBLICATION_SLOTS.length) return { slot, experiment: null, format: 'texto_control', style: 'control' }
  const question = dayNumber(now) % 2 === 1
  return { slot, experiment: EXPERIMENT_NAME, format: question ? 'texto_pregunta' : 'texto_control', style: question ? 'pregunta' : 'control' }
}

// ---------- la lectura del experimento ----------

export interface ExperimentPost { post_key: string; vacancy_slug: string | null; format: string | null; experiment: string | null; published_at: string | null }

export interface FormatResult {
  format: string
  label: string
  posts: number
  /** Personas que AvoTalent midió llegando desde cada publicación de este formato. */
  arrivals: number
  registrations: number
  avgArrivals: number | null
  medianArrivals: number | null
  minArrivals: number | null
  maxArrivals: number | null
  /** Cuántas publicaciones faltan para llegar al mínimo de comparación. */
  remaining: number
}

export interface ExperimentSummary {
  name: string
  minPosts: number
  formats: FormatResult[]
  /** comparable = todos los formatos ya tienen el mínimo; sin eso, cualquier diferencia puede ser azar. */
  comparable: boolean
  verdict: string
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Cuánta gente trajo cada formato, solo con publicaciones del experimento y medidas (salieron desde que AvoTalent mide los orígenes).
 * No concluye nada con pocas publicaciones: dice cuántas faltan y, cuando ya hay, solo afirma una diferencia si el promedio de un formato
 * es al menos el DOBLE del otro (una regla simple y prudente: con 10 publicaciones por formato, diferencias menores son ruido).
 */
export function buildExperiment(posts: ExperimentPost[], visits: Map<string, { people: number; registered: number }> | null, trackingSince: string | null): ExperimentSummary {
  const tracking = trackingSince ? trackingSince.slice(0, 10) : null
  const mine = posts.filter((post) => post.experiment === EXPERIMENT_NAME && post.format && post.vacancy_slug && post.published_at && tracking && post.published_at.slice(0, 10) >= tracking)
  const formats: FormatResult[] = FORMATS.map((format) => {
    const own = mine.filter((post) => post.format === format)
    const arrivals = own.map((post) => visits?.get(post.vacancy_slug!)?.people ?? 0)
    const registrations = own.reduce((total, post) => total + (visits?.get(post.vacancy_slug!)?.registered ?? 0), 0)
    const total = arrivals.reduce((a, b) => a + b, 0)
    return {
      format, label: FORMAT_LABEL[format], posts: own.length, arrivals: total, registrations,
      avgArrivals: own.length ? round1(total / own.length) : null, medianArrivals: median(arrivals), minArrivals: arrivals.length ? Math.min(...arrivals) : null, maxArrivals: arrivals.length ? Math.max(...arrivals) : null,
      remaining: Math.max(0, MIN_POSTS_PER_FORMAT - own.length),
    }
  })
  const comparable = formats.every((result) => result.remaining === 0)
  let verdict: string
  if (!comparable) {
    verdict = `Todavía es pronto: faltan ${formats.map((result) => `${result.remaining} de «${result.label}»`).join(' y ')} para llegar a ${MIN_POSTS_PER_FORMAT} por formato. Cualquier diferencia de hoy puede ser azar.`
  } else {
    const [a, b] = formats
    const high = Math.max(a.avgArrivals ?? 0, b.avgArrivals ?? 0)
    const low = Math.min(a.avgArrivals ?? 0, b.avgArrivals ?? 0)
    const best = (a.avgArrivals ?? 0) >= (b.avgArrivals ?? 0) ? a : b
    verdict = low > 0 && high >= low * 2 || low === 0 && high >= 2
      ? `«${best.label}» trae al menos el doble de gente por publicación. Es una diferencia grande: vale la pena seguir ese formato.`
      : 'Con las publicaciones de hoy la diferencia entre formatos no es grande: no hay razón para cambiar. Sigue probando o prueba otra idea.'
  }
  return { name: EXPERIMENT_NAME, minPosts: MIN_POSTS_PER_FORMAT, formats, comparable, verdict }
}

import { ROLE_CATEGORY_LABEL, type RoleCategory } from '@avocado/schemas'
import { ROLE_FOCUS } from '../audience/role-focus'
import { servesSomeone, type PersonProfile, type VacancyShape } from '../vacancies/serves-someone'
import { daysUntilNextBatch } from '../scraper/quota'

/**
 * Oferta y cola de vacantes por puesto: cuántas hay abiertas en el feed, cuántas esperan en la cola del scraper, cuántas le sirven a
 * al menos una persona real y si alcanzan para las publicaciones de LinkedIn (4 al día) hasta que llegue el próximo lote del scraper.
 * Solo MIDE: no cambia qué se publica.
 *
 * La reserva de LinkedIn se mide contra la VENTANA hasta el próximo lote, no como «cuántos días durarían todas»: lo que entra al feed
 * dura 45 días, pero el scraper vuelve a traer datos cada ~15 días, así que lo que importa es si lo útil alcanza para esa ventana y
 * cuántas sobrarían o faltarían cuando llegue el lote nuevo. Solo cuentan las vacantes que le sirven a alguien (con skills que las
 * personas tienen). Las reglas son puras para poder probarlas; la lectura de la base está en `supply-data.ts`.
 *
 * Lo que es un cálculo y no un conteo exacto: la cola se cuenta con las reglas de rol y de «le sirve a alguien»; el contacto y las
 * reglas del catálogo se revisan al publicar cada día, así que la cola real puede ser un poco menor.
 */
export const LINKEDIN_PER_DAY = 4

export interface OpenVacancy extends VacancyShape {
  id: string
  slug: string | null
  company: string | null
}
export interface QueuedVacancy extends VacancyShape {}

export interface RoleSupply {
  role: string
  label: string
  /** Candidatas con ese puesto. */
  candidates: number
  open: number
  openServing: number
  queued: number
  queuedServing: number
  /** Vacantes abiertas de este puesto que aún no se han publicado en LinkedIn (solo puestos del foco). */
  linkedinReserve: number
  /** ¿Es un puesto que se publica en LinkedIn? */
  inLinkedinFocus: boolean
}

export interface Supply {
  ready: true
  people: number
  totals: { open: number; openServing: number; openServingPct: number | null; queued: number; queuedServing: number; queuedServingPct: number | null }
  linkedin: {
    perDay: number
    /** Días hasta el próximo lote del scraper: la ventana que hay que cubrir. */
    windowDays: number
    /** Publicaciones que pide la ventana (días x 4). */
    needed: number
    /** Vacantes abiertas del foco que le sirven a alguien y no han salido en LinkedIn. */
    reserve: number
    /** Cuántos días de la ventana cubre la reserva (tope: la ventana). */
    coveredDays: number
    coversWindow: boolean
    /** Reserva menos lo que pide la ventana: positivo = sobran al llegar el lote nuevo; negativo = faltan. */
    balanceAtRefresh: number
    /** Con la cola que le sirve a alguien (entrará al feed durante la ventana). */
    reserveWithQueue: number
    balanceWithQueue: number
    focusRoles: string[]
  }
  nextBatch: { at: string | null; daysUntil: number | null }
  byRole: RoleSupply[]
  /** Puestos con vacantes abiertas pero ninguna candidata, y puestos con candidatas pero sin vacantes. */
  rolesWithoutPeople: string[]
  rolesWithoutVacancies: string[]
  notes: string[]
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const days = (count: number) => Math.round((count / LINKEDIN_PER_DAY) * 10) / 10
const labelOf = (role: string) => ROLE_CATEGORY_LABEL[role as RoleCategory] ?? role

export function buildSupply(input: {
  people: PersonProfile[]
  open: OpenVacancy[]
  /** Ids de vacantes que LinkedIn ya publicó (o tiene reservadas). */
  usedInLinkedin: Set<string>
  queued: QueuedVacancy[]
  nextBatchAt: Date | null
  now: Date
}): Supply {
  const rows = new Map<string, RoleSupply>()
  const row = (role: string): RoleSupply => {
    const existing = rows.get(role)
    if (existing) return existing
    const created: RoleSupply = { role, label: labelOf(role), candidates: 0, open: 0, openServing: 0, queued: 0, queuedServing: 0, linkedinReserve: 0, inLinkedinFocus: role in ROLE_FOCUS }
    rows.set(role, created)
    return created
  }

  for (const person of input.people) row(person.roleCategory).candidates += 1

  let reserve = 0
  for (const vacancy of input.open) {
    const role = vacancy.role_category ?? 'sin_puesto'
    const entry = row(role)
    entry.open += 1
    const serving = servesSomeone(vacancy, input.people)
    if (serving) entry.openServing += 1
    // La reserva de LinkedIn: lo que puede elegir `pickVacancy` (puesto del foco, con empresa y enlace), que aún no salió Y que le sirve a
    // alguien. Las que no le sirven a nadie no cuentan: no es lo que se quiere publicar.
    if (serving && entry.inLinkedinFocus && vacancy.slug && (vacancy.company ?? '').trim() && !input.usedInLinkedin.has(vacancy.id)) { entry.linkedinReserve += 1; reserve += 1 }
  }

  let queuedFocusServing = 0
  for (const vacancy of input.queued) {
    const role = vacancy.role_category ?? 'sin_puesto'
    const entry = row(role)
    entry.queued += 1
    if (servesSomeone(vacancy, input.people)) {
      entry.queuedServing += 1
      if (entry.inLinkedinFocus) queuedFocusServing += 1
    }
  }

  const byRole = [...rows.values()].sort((a, b) => b.candidates - a.candidates || b.open + b.queued - (a.open + a.queued))
  const open = byRole.reduce((sum, item) => sum + item.open, 0)
  const openServing = byRole.reduce((sum, item) => sum + item.openServing, 0)
  const queued = byRole.reduce((sum, item) => sum + item.queued, 0)
  const queuedServing = byRole.reduce((sum, item) => sum + item.queuedServing, 0)

  const windowDays = daysUntilNextBatch(input.now, input.nextBatchAt)
  const needed = windowDays * LINKEDIN_PER_DAY
  return {
    ready: true,
    people: input.people.length,
    totals: { open, openServing, openServingPct: share(openServing, open), queued, queuedServing, queuedServingPct: share(queuedServing, queued) },
    linkedin: {
      perDay: LINKEDIN_PER_DAY, windowDays, needed, reserve, coveredDays: Math.min(windowDays, days(reserve)), coversWindow: reserve >= needed, balanceAtRefresh: reserve - needed,
      reserveWithQueue: reserve + queuedFocusServing, balanceWithQueue: reserve + queuedFocusServing - needed, focusRoles: Object.keys(ROLE_FOCUS),
    },
    nextBatch: {
      at: input.nextBatchAt ? input.nextBatchAt.toISOString() : null,
      daysUntil: input.nextBatchAt ? Math.max(0, Math.ceil((input.nextBatchAt.getTime() - input.now.getTime()) / 86_400_000)) : null,
    },
    byRole,
    rolesWithoutPeople: byRole.filter((item) => item.candidates === 0 && item.open + item.queued > 0).map((item) => item.label),
    rolesWithoutVacancies: byRole.filter((item) => item.candidates > 0 && item.open + item.queued === 0).map((item) => item.label),
    notes: [
      'La ventana es lo que falta para el próximo lote del scraper. LinkedIn necesita 4 publicaciones por día en esa ventana; la reserva son las vacantes abiertas de los puestos del foco que le sirven a alguien y todavía no salen. Lo que sobra al llegar el lote nuevo envejece; lo que falta se queda sin publicar. «Con la cola» suma las que esperan y entrarán al feed durante la ventana.',
      'Una vacante dura 45 días desde que entra al feed; la cola, en cambio, se reparte para quedar vacía justo cuando llega el lote nuevo (el cupo diario de la sincronización).',
      'La cola se cuenta con las reglas de puesto y de «le sirve a alguien». El contacto y las reglas del catálogo se revisan al publicar, así que la cola real puede ser un poco menor.',
      'Es una foto de hoy y con pocas personas: las proporciones se mueven mucho con cada cuenta nueva.',
    ],
  }
}

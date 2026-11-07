import { ROLE_CATEGORY_LABEL, type RoleCategory } from '@avocado/schemas'
import { ROLE_FOCUS } from '../audience/role-focus'
import { servesSomeone, type PersonProfile, type VacancyShape } from '../vacancies/serves-someone'

/**
 * Oferta y cola de vacantes por puesto: cuántas hay abiertas en el feed, cuántas esperan en la cola del scraper, cuántas le sirven a
 * al menos una persona real y cuántos días de reserva le quedan a LinkedIn (4 publicaciones al día). Solo MIDE: no cambia qué se
 * publica. Las reglas son puras para poder probarlas; la lectura de la base está en `supply-data.ts`.
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
  linkedin: { perDay: number; reserve: number; reserveDays: number | null; reserveWithQueue: number; reserveWithQueueDays: number | null; focusRoles: string[] }
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
    if (servesSomeone(vacancy, input.people)) entry.openServing += 1
    // La reserva de LinkedIn: lo mismo que puede elegir `pickVacancy` (puesto del foco, con empresa y enlace) y que aún no salió.
    if (entry.inLinkedinFocus && vacancy.slug && (vacancy.company ?? '').trim() && !input.usedInLinkedin.has(vacancy.id)) { entry.linkedinReserve += 1; reserve += 1 }
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

  return {
    ready: true,
    people: input.people.length,
    totals: { open, openServing, openServingPct: share(openServing, open), queued, queuedServing, queuedServingPct: share(queuedServing, queued) },
    linkedin: { perDay: LINKEDIN_PER_DAY, reserve, reserveDays: days(reserve), reserveWithQueue: reserve + queuedFocusServing, reserveWithQueueDays: days(reserve + queuedFocusServing), focusRoles: Object.keys(ROLE_FOCUS) },
    nextBatch: {
      at: input.nextBatchAt ? input.nextBatchAt.toISOString() : null,
      daysUntil: input.nextBatchAt ? Math.max(0, Math.ceil((input.nextBatchAt.getTime() - input.now.getTime()) / 86_400_000)) : null,
    },
    byRole,
    rolesWithoutPeople: byRole.filter((item) => item.candidates === 0 && item.open + item.queued > 0).map((item) => item.label),
    rolesWithoutVacancies: byRole.filter((item) => item.candidates > 0 && item.open + item.queued === 0).map((item) => item.label),
    notes: [
      'La reserva de LinkedIn son las vacantes abiertas de los puestos del foco que todavía no se publican, entre 4 por día. «Con la cola» suma las que esperan en la cola y le sirven a alguien: entrarán al feed con los días.',
      'La cola se cuenta con las reglas de puesto y de «le sirve a alguien». El contacto y las reglas del catálogo se revisan al publicar, así que la cola real puede ser un poco menor.',
      'Es una foto de hoy y con pocas personas: las proporciones se mueven mucho con cada cuenta nueva.',
    ],
  }
}

import { getToken } from './session'

/**
 * Mis postulaciones (cliente). El formulario de postulación es del sitio de la empresa: no vemos si alguien se postuló, así que se lo
 * preguntamos al volver y guardamos lo que contesta. Nada de aquí rompe la pantalla si falla: devuelve null y la app sigue como siempre.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export type ApplicationStatus = 'clicked' | 'not_yet' | 'applied' | 'interview' | 'offer' | 'rejected'

export interface Application {
  id: string
  vacancyId: string
  slug: string | null
  title: string
  company: string | null
  host: string | null
  status: ApplicationStatus
  clickedAt: string
  appliedAt: string | null
  closed?: boolean
}

export type ApplyAnswer = 'applied' | 'not_yet' | 'later'

/** Los estados que la persona puede poner ella misma, con el texto con el que se muestran. */
export const STATUS_OPTIONS: { value: Exclude<ApplicationStatus, 'clicked'>; label: string }[] = [
  { value: 'not_yet', label: 'Por postularme' },
  { value: 'applied', label: 'Postulada' },
  { value: 'interview', label: 'En proceso o entrevista' },
  { value: 'offer', label: 'Con oferta' },
  { value: 'rejected', label: 'No avanzó' },
]

/** Se avisa a las pantallas abiertas (el detalle y las tarjetas del feed) cuando cambia el estado de una vacante. */
export const APPLICATION_CHANGED = 'avo:application-changed'
export interface ApplicationChange { vacancyId: string; status: ApplicationStatus }
export function announceApplication(change: ApplicationChange): void {
  try {
    window.dispatchEvent(new CustomEvent<ApplicationChange>(APPLICATION_CHANGED, { detail: change }))
  } catch {
    // sin ventana (pruebas o servidor): nada que avisar
  }
}

/** «Ya se postuló» a cualquier título: postulada, en proceso, con oferta o sin avanzar. */
export const isApplied = (status: ApplicationStatus | null | undefined): boolean => status === 'applied' || status === 'interview' || status === 'offer' || status === 'rejected'

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = getToken()
  if (!token) return null
  try {
    return await fetch(`${API_URL}/api/community/applications${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
  } catch {
    return null
  }
}

/** La persona salió a postularse: se guarda el intento para preguntarle al volver. */
export async function recordApplicationClick(vacancyId: string): Promise<Application | null> {
  const res = await call('', { method: 'POST', body: JSON.stringify({ vacancyId }) })
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return data?.application ?? null
}

/** El intento por el que toca preguntar «¿Ya te postulaste?», o null. */
export async function fetchPendingApplication(): Promise<Application | null> {
  const res = await call('/pending')
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return data?.application ?? null
}

export async function answerApplication(id: string, answer: ApplyAnswer): Promise<Application | null> {
  const res = await call(`/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) })
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  const application: Application | null = data?.application ?? null
  if (application) announceApplication({ vacancyId: application.vacancyId, status: application.status })
  return application
}

/** Mis postulaciones. null si no se pudieron cargar (la pantalla lo avisa). */
export async function listApplications(): Promise<Application[] | null> {
  const res = await call('')
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return Array.isArray(data?.applications) ? data.applications : null
}

export async function setApplicationStatus(id: string, status: ApplicationStatus): Promise<Application | null> {
  const res = await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  const application: Application | null = data?.application ?? null
  if (application) announceApplication({ vacancyId: application.vacancyId, status: application.status })
  return application
}

export async function removeApplication(id: string): Promise<boolean> {
  const res = await call(`/${id}`, { method: 'DELETE' })
  return !!res && (res.ok || res.status === 204)
}

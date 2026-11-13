import { randomBytes } from 'crypto'
import { appEnv, scheduledJobsEnabled } from '../../config/app-env'
import { initCron } from '../cron.service'
import { databaseLease, startLeader, type Leader, type LeaseApi } from './leader'

/**
 * Cómo arrancan las tareas programadas, igual desde la API que desde el servicio de workers:
 *  - Solo en producción (config/app-env.ts).
 *  - Solo en el proceso que gana el arrendamiento `crons`: nunca dos a la vez.
 *  - Si el arrendamiento no se puede usar (la migración no se ha aplicado): la API arranca como siempre lo hizo (para no quedarse sin crons
 *    mientras se aplica) y avisa fuerte; el servicio de workers NO arranca nada (para no duplicar lo que ya corre la API).
 *
 * Quién corre los crons se decide con dos variables:
 *  - API:      RUN_CRONS_IN_API=off  -> la API no corre crons (se apaga cuando el servicio de workers ya está funcionando).
 *  - Workers:  WORKERS_ENABLED=on    -> el servicio de workers participa en la elección.
 */
export type Role = 'api' | 'worker'
export const LEASE_NAME = 'crons'

export const cronsInApi = (env: NodeJS.ProcessEnv = process.env): boolean => (env.RUN_CRONS_IN_API ?? 'on').trim().toLowerCase() !== 'off'
export const workersEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => (env.WORKERS_ENABLED ?? '').trim().toLowerCase() === 'on'

export const holderId = (role: Role, env: NodeJS.ProcessEnv = process.env): string =>
  `${role}:${env.RAILWAY_SERVICE_NAME ?? 'local'}:${env.RAILWAY_REPLICA_ID ?? process.pid}:${randomBytes(3).toString('hex')}`

export interface StartOptions {
  role: Role
  env?: NodeJS.ProcessEnv
  lease?: LeaseApi
  /** Para pruebas: en lugar de initCron real. */
  startJobs?: () => () => void
  log?: (message: string) => void
}

/** Devuelve el líder (o null si en este proceso no corresponde participar). */
export function startScheduledJobs(options: StartOptions): Leader | null {
  const env = options.env ?? process.env
  const log = options.log ?? ((message: string) => console.log(message))
  if (!scheduledJobsEnabled(env)) {
    log(`[Entorno] ${appEnv(env)}: tareas programadas apagadas`)
    return null
  }
  if (options.role === 'api' && !cronsInApi(env)) {
    log('[Tareas] RUN_CRONS_IN_API=off: esta API no corre tareas programadas (las corre el servicio de workers)')
    return null
  }
  if (options.role === 'worker' && !workersEnabled(env)) {
    log('[Tareas] WORKERS_ENABLED no está en «on»: el servicio de workers espera sin correr nada')
    return null
  }

  const startJobs = options.startJobs ?? initCron
  let stopJobs: (() => void) | null = null
  const begin = () => { if (!stopJobs) stopJobs = startJobs() }
  const end = () => { stopJobs?.(); stopJobs = null }

  return startLeader({
    name: LEASE_NAME,
    holder: holderId(options.role, env),
    lease: options.lease ?? databaseLease(),
    onLead: begin,
    onLost: end,
    onDenied: end,
    log,
    onUnavailable: () => {
      if (options.role === 'api') {
        log('[Tareas] ALARMA: el arrendamiento de crons no está disponible (falta aplicar packages/db/migrations/202611131400_worker_leases.sql). La API corre los crons SIN arrendamiento, como antes.')
        begin()
      } else {
        log('[Tareas] ALARMA: el arrendamiento de crons no está disponible: el servicio de workers no corre nada hasta que se aplique la migración.')
      }
    },
  })
}

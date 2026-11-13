import { supabase } from '../supabase.service'

/**
 * Elección de líder de las tareas programadas: solo el proceso que tiene el arrendamiento `crons` (tabla `worker_leases`) las corre. Lo pide con
 * vencimiento, lo renueva seguido y lo suelta al apagarse; si muere, vence solo y otro lo toma. Resultado: dos copias de la API, o la API y el
 * servicio de workers a la vez, jamás disparan dos veces un correo ni una publicación de LinkedIn.
 *
 * SQL: packages/db/migrations/202611131400_worker_leases.sql (se aplica a mano, como todas).
 */
export type LeaseAnswer = 'yes' | 'no' | 'unavailable'

export interface LeaseApi {
  acquire(name: string, holder: string, ttlSeconds: number): Promise<LeaseAnswer>
  release(name: string, holder: string): Promise<void>
}

/** El arrendamiento sobre la base real. `unavailable` = la función no existe (migración sin aplicar) o la base no contestó. */
export function databaseLease(): LeaseApi {
  return {
    async acquire(name, holder, ttlSeconds) {
      try {
        const { data, error } = await supabase.rpc('worker_lease_acquire', { p_name: name, p_holder: holder, p_ttl_seconds: ttlSeconds })
        if (error) return 'unavailable'
        return data === true ? 'yes' : 'no'
      } catch {
        return 'unavailable'
      }
    },
    async release(name, holder) {
      try {
        await supabase.rpc('worker_lease_release', { p_name: name, p_holder: holder })
      } catch {
        // al apagarse no hay nada más que hacer: el arrendamiento vence solo
      }
    },
  }
}

export interface LeaderOptions {
  name: string
  holder: string
  lease: LeaseApi
  /** Se llama una vez al ganar el arrendamiento (y de nuevo si se pierde y se vuelve a ganar). */
  onLead: () => void
  /** Se llama al perderlo: hay que detener todo lo que se arrancó en `onLead`. */
  onLost: () => void
  /** Se llama cada vez que se pide el arrendamiento y lo tiene OTRO proceso (y este no era líder): sirve para detener lo que se hubiera arrancado sin arrendamiento. */
  onDenied?: () => void
  /** Se llama (una vez por periodo sin respuesta) mientras no se puede saber si hay arrendamiento y este proceso NO es líder. */
  onUnavailable?: () => void
  ttlSeconds?: number
  everySeconds?: number
  /** Cuántas respuestas malas seguidas tolera un líder antes de darse por perdido (por omisión 2: con ttl 60 y cada 15 s, aún tiene margen). */
  graceTicks?: number
  log?: (message: string) => void
}

export interface Leader {
  isLeader(): boolean
  /** Un ciclo de renovación (lo llama el temporizador; se expone para las pruebas). */
  tick(): Promise<void>
  /** Suelta el arrendamiento y detiene el temporizador. */
  stop(): Promise<void>
}

export function startLeader(options: LeaderOptions): Leader {
  const ttl = options.ttlSeconds ?? 60
  const every = options.everySeconds ?? 15
  const grace = options.graceTicks ?? 2
  const log = options.log ?? ((message: string) => console.log(message))
  let leader = false
  let badTicks = 0
  let announcedUnavailable = false
  let stopped = false
  let running: Promise<void> | null = null

  async function tick() {
    if (stopped) return
    const answer = await options.lease.acquire(options.name, options.holder, ttl)
    if (stopped) return
    if (answer === 'yes') {
      badTicks = 0
      announcedUnavailable = false
      if (!leader) {
        leader = true
        log(`[Líder] ${options.holder} tomó el arrendamiento «${options.name}»`)
        options.onLead()
      }
    } else if (answer === 'no') {
      badTicks = 0
      announcedUnavailable = false
      if (leader) {
        leader = false
        log(`[Líder] ${options.holder} perdió el arrendamiento «${options.name}»: detiene sus tareas`)
        options.onLost()
      } else {
        options.onDenied?.()
      }
    } else if (leader) {
      // No se sabe si todavía es dueño: se aguanta un poco (el arrendamiento sigue vigente 60 s) y luego se suelta por seguridad.
      badTicks++
      if (badTicks > grace) {
        leader = false
        log(`[Líder] ${options.holder} no pudo renovar «${options.name}»: detiene sus tareas por seguridad`)
        options.onLost()
      }
    } else if (!announcedUnavailable) {
      announcedUnavailable = true
      options.onUnavailable?.()
    }
  }

  const guarded = () => {
    if (running) return running
    running = tick().catch((error) => log(`[Líder] error en el ciclo: ${error instanceof Error ? error.message : error}`)).finally(() => { running = null })
    return running
  }

  const timer = setInterval(() => { void guarded() }, every * 1000)
  timer.unref?.()
  void guarded()

  return {
    isLeader: () => leader,
    tick: guarded,
    async stop() {
      stopped = true
      clearInterval(timer)
      if (running) await running
      if (leader) {
        leader = false
        options.onLost()
        await options.lease.release(options.name, options.holder)
      }
    },
  }
}

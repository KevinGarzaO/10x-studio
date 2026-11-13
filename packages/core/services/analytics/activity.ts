import { supabase } from '../supabase.service'
import { dayKey } from './metrics'

/**
 * Registra que una persona estuvo activa hoy: una fila por persona y día (`user_activity_daily`).
 * Es la materia prima de la retención (cuánta gente vuelve), que no se puede reconstruir después:
 * si hoy no se anota, ese día se pierde.
 *
 * Se llama en cada petición con sesión, así que lo barato importa: un mismo día solo se escribe una
 * vez por persona mientras el servidor siga encendido (el resto sale de la memoria), y el insert
 * ignora los duplicados. Nunca bloquea ni rompe la petición: si falla (por ejemplo, la tabla aún no
 * existe) se ignora.
 */
const seen = new Set<string>()
let seenDay = ''

export function recordActivity(userId: string | undefined, now: Date = new Date()): void {
  if (!userId) return
  try {
    const day = dayKey(now.toISOString())
    if (day !== seenDay) {
      seen.clear()
      seenDay = day
    }
    if (seen.has(userId)) return
    seen.add(userId)

    Promise.resolve(supabase.from('user_activity_daily').upsert({ user_id: userId, day }, { onConflict: 'user_id,day', ignoreDuplicates: true }))
      .then((result: { error?: unknown } | undefined) => {
        // Si no se pudo escribir, se vuelve a intentar en la siguiente petición.
        if (result?.error) seen.delete(userId)
      })
      .catch(() => seen.delete(userId))
  } catch {
    // medir la actividad nunca debe afectar a la petición
  }
}

/** Solo para las pruebas. */
export function resetActivityCache(): void {
  seen.clear()
  seenDay = ''
}

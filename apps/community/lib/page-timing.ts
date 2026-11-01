import { useEffect, useRef } from 'react'
import { flowFor, pageLoadMs } from './flow-tracker'

/**
 * Cuánto tarda en estar lista una pantalla que importa (el feed y la vacante), medido en el navegador de la persona.
 *
 * Se apoya en los flujos críticos (lib/flow-tracker.ts): al abrir la pantalla empieza un intento, y cuando ya tiene contenido
 * que mostrar se cierra con el tiempo transcurrido. Así aparece en Tráfico web > Flujos críticos con su tiempo, su abandono (se fue
 * antes de verla lista) y su frustración (más de 2.5 s). Si es la primera página que abre la persona (por ejemplo, llegando desde un
 * enlace de LinkedIn), el paso de inicio lleva además lo que tardó en cargar la página completa.
 */
export type PageFlow = 'view_feed' | 'view_vacancy'

/**
 * `ready` pasa a true cuando la pantalla ya muestra contenido. `key` identifica qué se está viendo (la vacante): si cambia, se
 * mide de nuevo. Medir nunca debe romper la pantalla.
 */
export function usePageReady(flow: PageFlow, ready: boolean, key = ''): void {
  const startedAt = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    try {
      startedAt.current = performance.now()
      done.current = false
      flowFor(flow).startFlow({ loadTimeMs: pageLoadMs() })
    } catch {
      // nada
    }
  }, [flow, key])

  useEffect(() => {
    if (!ready || done.current || startedAt.current === 0) return
    done.current = true
    try {
      const ms = Math.round(performance.now() - startedAt.current)
      flowFor(flow).completeFlow('ready', ms)
    } catch {
      // nada
    }
  }, [flow, key, ready])
}

/**
 * Detector de "rage clicks": varios clics seguidos casi en el mismo lugar, que es lo que hace alguien cuando algo no responde.
 * (Clarity mide lo mismo por página; esto lo mide DENTRO de un flujo, para marcar el paso exacto donde la persona se frustró.)
 *
 * Regla: 3 clics o más en menos de 1 segundo y a menos de 30 píxeles unos de otros.
 */
export const RAGE_CLICKS = 3
export const RAGE_WINDOW_MS = 1000
export const RAGE_RADIUS_PX = 30

export interface ClickPoint { at: number; x: number; y: number }

/**
 * Dado el último clic y los anteriores, ¿esto ya es un rage click? Devuelve cuántos clics seguidos hay (0 si no lo es).
 * Pura, para poder probarla sin navegador.
 */
export function rageCount(history: ClickPoint[], click: ClickPoint): number {
  const close = history.filter(previous => click.at - previous.at <= RAGE_WINDOW_MS && Math.hypot(click.x - previous.x, click.y - previous.y) <= RAGE_RADIUS_PX)
  const total = close.length + 1
  return total >= RAGE_CLICKS ? total : 0
}

/** Escucha los clics de la página y avisa en cada rage click. Devuelve cómo dejar de escuchar. */
export function startRageClickDetector(onRage: (clicks: number) => void): () => void {
  if (typeof document === 'undefined') return () => {}
  let history: ClickPoint[] = []
  let lastFired = 0

  const onClick = (event: MouseEvent) => {
    const point = { at: Date.now(), x: event.clientX, y: event.clientY }
    history = history.filter(previous => point.at - previous.at <= RAGE_WINDOW_MS)
    const count = rageCount(history, point)
    history.push(point)
    // Una ráfaga larga cuenta una vez, no una por cada clic de más.
    if (count > 0 && point.at - lastFired > RAGE_WINDOW_MS) {
      lastFired = point.at
      onRage(count)
    }
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

import { useEffect, useState } from 'react'

/**
 * ¿La pantalla es chica (la de la vacante ya no tiene columna lateral)? Mismo corte que el CSS de `.detail-grid` (1080 px).
 * Sirve para dibujar UNA sola copia de un botón en el lugar que le toca, en vez de dos copias de las que una está escondida
 * (lectores de pantalla y pruebas verían las dos). Empieza en `false` (escritorio) y se corrige al montar.
 */
export function useCompactLayout(maxWidth = 1080): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [maxWidth])
  return compact
}

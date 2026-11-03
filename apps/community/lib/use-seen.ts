import { useCallback, useEffect, useRef } from 'react'

/**
 * Avisa UNA vez por `key` cuando el elemento al que se pone el `ref` entra de verdad en pantalla (al menos la mitad visible).
 * Sirve para saber si la gente llegó a ver un botón (por ejemplo «Postularse», que en pantallas chicas puede quedar fuera de la vista).
 * Sin IntersectionObserver (navegadores muy viejos, pruebas) no avisa: es mejor no medir que decir que se vio sin saberlo.
 */
export function useSeenOnce(key: string, onSeen: () => void) {
  const reported = useRef(new Set<string>())
  const observer = useRef<IntersectionObserver | null>(null)
  const latest = useRef({ key, onSeen })
  latest.current = { key, onSeen }

  useEffect(() => () => observer.current?.disconnect(), [])

  return useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node || typeof IntersectionObserver === 'undefined') return
    const watcher = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      const { key: current, onSeen: report } = latest.current
      if (reported.current.has(current)) return
      reported.current.add(current)
      report()
      watcher.disconnect()
    }, { threshold: 0.5 })
    watcher.observe(node)
    observer.current = watcher
  }, [])
}

'use client'

import { useEffect } from 'react'
import { loadFlags } from '../lib/flags'

/** No dibuja nada: pide las funciones de la persona al abrir la página, al volver a la pestaña y cada vez que entra o sale una sesión. */
export function FlagsLoader() {
  useEffect(() => {
    void loadFlags()
    const reload = () => { void loadFlags() }
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('avo:session-changed', reload)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('avo:session-changed', reload)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return null
}

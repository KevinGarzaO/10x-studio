'use client'

import { useLayoutEffect } from 'react'
import { installApiKey } from '../lib/api-key'

/**
 * No dibuja nada. Hace que toda llamada del navegador a nuestra API lleve la llave de aplicación (NEXT_PUBLIC_API_KEY, ver lib/api-key.ts). Va PRIMERO en el layout y usa un efecto de layout para estar instalado antes de que cualquier otro componente haga su
 * primera llamada; el envoltorio de sesión (SessionKeeper) se instala después y toma este `fetch`.
 */
export function ApiKeyGate() {
  useLayoutEffect(() => installApiKey(window as unknown as { fetch: typeof fetch }), [])
  return null
}

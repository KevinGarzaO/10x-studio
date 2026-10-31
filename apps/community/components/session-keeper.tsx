'use client'

import { useEffect } from 'react'
import { installAuthFetch } from '../lib/auth-fetch'

/**
 * No dibuja nada: hace que toda llamada con sesión renueve el token cuando hace falta (ver lib/auth-fetch.ts). Va ANTES que
 * <ErrorCapture/> en el layout, para que el vigilante de errores vea la respuesta final y no la que ya se arregló sola.
 */
export function SessionKeeper() {
  useEffect(() => installAuthFetch(), [])
  return null
}

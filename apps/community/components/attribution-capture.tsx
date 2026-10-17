'use client'

import { useEffect } from 'react'
import { captureAttribution } from '../lib/attribution'

/** No dibuja nada: al entrar al sitio guarda de dónde llegó la visita (ver lib/attribution.ts). */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution()
  }, [])
  return null
}

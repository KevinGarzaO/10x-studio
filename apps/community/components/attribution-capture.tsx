'use client'

import { useEffect } from 'react'
import { captureAttribution } from '@/lib/attribution'

// Se monta una sola vez en el layout raíz y guarda los UTM/referrer del primer
// contacto. Va en un componente cliente porque necesita leer la URL y
// localStorage.
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution()
  }, [])

  return null
}

'use client'

import { useEffect } from 'react'
import { installGlobalErrorHandlers } from '../lib/error-reporter'

/** No dibuja nada: escucha los errores que nadie atrapó (excepciones y promesas) y los reporta. Ver lib/error-reporter.ts. */
export function ErrorCapture() {
  useEffect(() => installGlobalErrorHandlers(), [])
  return null
}

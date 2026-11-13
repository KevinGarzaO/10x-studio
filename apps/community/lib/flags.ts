'use client'

import { useSyncExternalStore } from 'react'

/**
 * Funciones nuevas encendidas por grupo (interruptores). El SERVIDOR decide quién ve qué (packages/core/services/flags); aquí solo se guarda lo
 * que contestó para mostrar u ocultar pantallas. Esconder algo aquí no es un permiso: la ruta nueva del backend va con `requireFlag`.
 *
 *   const verSeguir = useFlag('seguir_personas')
 *
 * Mientras no llega la respuesta, o si falla, TODO está apagado: una función nueva jamás aparece "de más".
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const EMPTY: Readonly<Record<string, boolean>> = Object.freeze({})

let current: Readonly<Record<string, boolean>> = EMPTY
const listeners = new Set<() => void>()

function publish(next: Record<string, boolean>) {
  const same = Object.keys(next).length === Object.keys(current).length && Object.keys(next).every((key) => current[key] === next[key])
  if (same) return
  current = Object.freeze({ ...next })
  listeners.forEach((listener) => listener())
}

/** Vuelve a pedir las funciones de la persona actual (con su sesión si la hay). Nunca lanza. */
export async function loadFlags(): Promise<void> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('avocado_token') : null
    const response = await fetch(`${API_URL}/api/community/flags`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
    if (!response.ok) return
    const body = (await response.json()) as { flags?: Record<string, boolean> }
    publish(body.flags && typeof body.flags === 'object' ? body.flags : {})
  } catch {
    // sin respuesta: se queda lo que había (al inicio, todo apagado)
  }
}

/** Para pruebas: pone las funciones a mano. */
export function setFlagsForTest(flags: Record<string, boolean>) {
  publish(flags)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useFlags(): Readonly<Record<string, boolean>> {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY)
}

export function useFlag(key: string): boolean {
  return useFlags()[key] === true
}

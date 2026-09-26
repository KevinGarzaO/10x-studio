'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, getCachedUser, getToken } from '../lib/session'
import { useSkillCatalog } from '../lib/skill-catalog'
import { profileGateReason } from '../lib/profile-gate'

/**
 * Manda a completar el perfil a quien tenga sesión y le falte algo obligatorio
 * (FR-025).
 *
 * Se monta en el shell del feed, en AccountLayout (que cubre ajustes, guardados
 * y notificaciones) y en crear publicación, porque esas pantallas viven fuera
 * del grupo de rutas del shell y hasta ahora quedaban sin verificación.
 *
 * No renderiza nada: solo redirige. Así se puede montar dentro de páginas que
 * son server components sin convertirlas.
 */
export function ProfileGate({ user }: { user?: unknown }) {
  const router = useRouter()
  const { catalog } = useSkillCatalog()
  const [resolved, setResolved] = useState<unknown>(user ?? null)

  useEffect(() => {
    if (user !== undefined) return
    if (!getToken()) return

    // Se parte del usuario en caché para no esperar la red, y se confirma con
    // el servidor: es quien tiene la verdad de lo que falta.
    const cached = getCachedUser()
    if (cached) setResolved(cached)
    fetchCurrentUser()
      .then(fresh => setResolved(fresh))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!resolved) return
    if (profileGateReason(resolved as never, catalog)) {
      router.replace('/onboarding')
    }
  }, [resolved, catalog, router])

  return null
}

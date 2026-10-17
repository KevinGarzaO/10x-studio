'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, getToken } from '../lib/session'
import { useSkillCatalog } from '../lib/skill-catalog'
import { profileGateReason } from '../lib/profile-gate'
import { clearReturnTo } from '../lib/return-to'

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
export function ProfileGate() {
  const router = useRouter()
  const { catalog, loading } = useSkillCatalog()
  const [user, setUser] = useState<unknown>(null)

  useEffect(() => {
    if (!getToken()) return

    // La decisión se toma SOLO con lo que responde el servidor. El usuario en
    // caché (localStorage) puede ser parcial o viejo, y con él se expulsaría a
    // onboarding a alguien que tiene su perfil completo.
    fetchCurrentUser()
      .then(fresh => setUser(fresh))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Se espera el catálogo: sin él no se sabe qué skills son válidos.
    if (!user || loading) return
    if (profileGateReason(user as never, catalog)) {
      router.replace('/onboarding')
    } else {
      // Perfil completo: ya no hay recorrido pendiente, y una ruta guardada vieja no debe
      // mandarlo a una vacante en su próximo registro.
      clearReturnTo()
    }
  }, [user, catalog, loading, router])

  return null
}

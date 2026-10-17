'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { captureSessionFromUrl } from '@/lib/session'

// Supabase entrega los tokens OAuth (y el enlace de confirmación de correo) como
// fragmento `#access_token=...` en el `redirect_to` que le regresamos, pero si
// esa URL no está en la lista blanca del dashboard cae en el Site URL (raíz, u
// otra página) y los tokens se perderían: la persona queda sin sesión y todo
// regresa a /login. Se captura la sesión en CUALQUIER página y, si había tokens,
// se continúa el flujo en /auth/callback (que crea la fila en `users`).
// /auth/callback se excluye: ella misma lee su hash (también para mostrar los
// errores que Supabase devuelva en él).
export function SessionCapture() {
  const router = useRouter()

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') return
    const captured = captureSessionFromUrl()
    if (captured) router.replace('/auth/callback')
  }, [router])

  return null
}

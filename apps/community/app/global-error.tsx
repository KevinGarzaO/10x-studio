'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-reporter'

/** Un error en el layout raíz (lo último que se puede atrapar). Reemplaza toda la página, por eso trae su propio html y body. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'global', ...(error.digest ? { digest: error.digest } : {}) })
  }, [error])

  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, display: 'grid', minHeight: '100vh', placeItems: 'center' }}>
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h2>Algo salió mal</h2>
          <p>Ya avisamos al equipo. Intenta de nuevo o recarga la página.</p>
          <button type="button" onClick={() => retry()}>Reintentar</button>
        </div>
      </body>
    </html>
  )
}

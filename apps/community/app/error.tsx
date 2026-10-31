'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/global-error-boundary'
import { reportError } from '@/lib/error-reporter'

/** Un error al dibujar una página: se reporta (con el `digest` para encontrarlo en los logs del servidor) y se ofrece reintentar. */
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'route', ...(error.digest ? { digest: error.digest } : {}) })
  }, [error])

  return <ErrorFallback retry={retry} />
}

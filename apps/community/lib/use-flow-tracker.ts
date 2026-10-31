'use client'

import { useMemo } from 'react'
import { flowFor, type FlowApi, type FlowName } from './flow-tracker'

/**
 * El rastreador de un flujo crítico para componentes de React: `startFlow`, `trackStep`, `failFlow` y `completeFlow`.
 * Es el mismo objeto en todo el sitio (ver lib/flow-tracker.ts), así que un flujo puede empezar en una página y cerrarse en otra.
 */
export function useFlowTracker(flowName: FlowName): FlowApi {
  return useMemo(() => flowFor(flowName), [flowName])
}

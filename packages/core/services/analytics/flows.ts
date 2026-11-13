/**
 * Los flujos críticos para el panel: el resumen por flujo y, paso a paso, cuántos intentos llegan a cada uno y cuántos se
 * quedan ahí. (La consulta del servidor MCP hace la misma cuenta: packages/mcp-analytics/src/telemetry-queries.ts.)
 */
export interface FlowStepRow {
  flow_name: string
  step_name: string
  step_order: number
  reached: number
  /** De los que llegaron, cuántos siguieron a un paso posterior. */
  continued: number
  is_final: boolean | null
  avg_duration_ms: number | null
  avg_load_time_ms: number | null
  errors: number
  frustrated: number
  rage_clicks: number
}

export interface FlowStep {
  name: string
  order: number
  reached: number
  avgDurationMs: number | null
  avgLoadTimeMs: number | null
  errors: number
  frustrated: number
  rageClicks: number
  /** De los que llegaron a este paso, el % que no siguió a ningún paso posterior. null en el paso final (el que completa el flujo). */
  dropoffToNextPct: number | null
}

const lossPct = (row: FlowStepRow): number | null =>
  row.is_final || row.reached === 0 ? null : Math.round(Math.max(0, 1 - row.continued / row.reached) * 1000) / 10

/** Agrupa los pasos por flujo, en orden, con lo que se pierde después de cada uno. */
export function stepsByFlow(rows: FlowStepRow[]): Record<string, FlowStep[]> {
  const out: Record<string, FlowStep[]> = {}
  for (const row of [...rows].sort((a, b) => a.step_order - b.step_order)) {
    ;(out[row.flow_name] ??= []).push({
      name: row.step_name,
      order: row.step_order,
      reached: row.reached,
      avgDurationMs: row.avg_duration_ms,
      avgLoadTimeMs: row.avg_load_time_ms,
      errors: row.errors,
      frustrated: row.frustrated,
      rageClicks: row.rage_clicks,
      dropoffToNextPct: lossPct(row),
    })
  }
  return out
}

import 'dotenv/config'
import { CHANGE_KINDS, recordChange, type ChangeKind } from '../services/analytics/changes'

/**
 * Anota a mano un cambio que NO es un commit: un interruptor que se prendió en Railway, un cambio de horario, un texto nuevo...
 *   npm run log-change -- "Se prendió el envío de bienvenida" --kind config --area email --expects "registros completados"
 *   npm run log-change -- "Título" --at 2026-10-31T14:00   (si pasó antes; por defecto, ahora)
 *   --desc "texto largo opcional"
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index > -1 ? process.argv[index + 1] : undefined
}

async function main() {
  const title = process.argv.slice(2).find((arg, index, all) => !arg.startsWith('--') && !(index > 0 && all[index - 1].startsWith('--')))
  if (!title) throw new Error('Falta el título: npm run log-change -- "Qué cambió" [--kind config] [--area email] [--expects "qué número debería moverse"] [--at fecha] [--desc "detalle"]')
  const kind = (option('kind') ?? 'feature') as ChangeKind
  if (!CHANGE_KINDS.includes(kind)) throw new Error(`--kind debe ser uno de: ${CHANGE_KINDS.join(', ')}`)
  const at = option('at')
  const shippedAt = at ? new Date(at) : new Date()
  if (Number.isNaN(shippedAt.getTime())) throw new Error('--at no es una fecha válida (ejemplo: 2026-10-31T14:00)')

  const result = await recordChange({ title, kind, area: option('area'), expectedMetric: option('expects'), description: option('desc'), source: 'manual', shippedAt })
  if (!result.saved) throw new Error(result.reason ?? 'No se guardó.')
  console.log(`Anotado: ${title} (${kind}, ${shippedAt.toISOString()})`)
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

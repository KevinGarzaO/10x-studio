/**
 * Reporte semanal: qué publicaciones trajeron visitas y registros en los
 * últimos 7 días, y cuánto convirtió cada una.
 *
 *   npm run weekly-report
 *
 * Es el insumo de la revisión semanal: ordena por registros, muestra la
 * conversión (registros entre visitantes distintos) y marca si cada código
 * está registrado en Medición (label) o es automático (vacante publicada sola).
 */
import { supabase } from '../services/supabase.service'

const DIAS = 7

async function main() {
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString()

  const [visitasRes, registrosRes, trackedRes] = await Promise.all([
    supabase.from('landing_visits').select('created_at, content, visitor_id').gte('created_at', desde),
    supabase.from('users').select('created_at, signup_content, is_test_account, is_scraper_profile').gte('created_at', desde),
    supabase.from('linkedin_tracked_posts').select('utm_content, label'),
  ])

  if (visitasRes.error) {
    console.error(`No se pudieron leer las visitas: ${visitasRes.error.message}`)
    process.exit(1)
  }

  const labels = new Map<string, string>(
    (trackedRes.data || []).map((r: any) => [r.utm_content, r.label])
  )

  const visitas = visitasRes.data || []
  const registrosTotales = (registrosRes.data || []).filter(
    (r: any) => !r.is_test_account && !r.is_scraper_profile
  )
  const registrosAtribuidos = registrosTotales.filter((r: any) => r.signup_content)

  const porCodigo = new Map<string, { visitantes: Set<string>; visitas: number; registros: number }>()
  const fila = (codigo: string) => {
    if (!porCodigo.has(codigo)) porCodigo.set(codigo, { visitantes: new Set(), visitas: 0, registros: 0 })
    return porCodigo.get(codigo)!
  }

  for (const v of visitas) {
    if (!v.content) continue
    const f = fila(v.content)
    f.visitantes.add(v.visitor_id)
    f.visitas++
  }
  for (const r of registrosAtribuidos) fila(r.signup_content).registros++

  const filas = [...porCodigo.entries()]
    .map(([codigo, f]) => ({
      publicacion: labels.get(codigo) || codigo.slice(0, 42),
      origen: labels.has(codigo) ? 'registrada' : 'auto',
      visitantes: f.visitantes.size,
      visitas: f.visitas,
      registros: f.registros,
      conversion_pct: f.visitantes.size > 0
        ? `${((100 * f.registros) / f.visitantes.size).toFixed(1)}%`
        : '-',
    }))
    .sort((a, b) => b.registros - a.registros || b.visitantes - a.visitantes)

  console.log(`\nÚltimos ${DIAS} días (desde ${desde.slice(0, 10)})\n`)
  if (filas.length === 0) {
    console.log('Sin visitas ni registros con código en el periodo.')
  } else {
    console.table(filas)
  }

  const porDia = new Map<string, { visitas: number; registros: number }>()
  for (const v of visitas) {
    const d = v.created_at.slice(0, 10)
    const f = porDia.get(d) || { visitas: 0, registros: 0 }
    f.visitas++
    porDia.set(d, f)
  }
  for (const r of registrosTotales) {
    const d = r.created_at.slice(0, 10)
    const f = porDia.get(d) || { visitas: 0, registros: 0 }
    f.registros++
    porDia.set(d, f)
  }

  console.log('Por día (todos los orígenes, incluye sin-tag):\n')
  console.table(
    [...porDia.entries()]
      .sort()
      .map(([dia, f]) => ({ dia, visitas: f.visitas, registros: f.registros }))
  )

  const totalRegistros = registrosTotales.length
  const conCodigo = registrosAtribuidos.length
  const sinTag = totalRegistros - conCodigo
  console.log(
    `Registros totales: ${totalRegistros} · con código: ${conCodigo} · sin-tag: ${sinTag}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

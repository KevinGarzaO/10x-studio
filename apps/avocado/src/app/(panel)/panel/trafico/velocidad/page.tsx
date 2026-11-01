'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DataTable } from '@/components/panel/DataTable'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'

interface RouteTiming {
  method: string
  route: string
  requests: number
  errors: number
  errorPct: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  totalSeconds: number
  sharePct: number
  slow: boolean
}
interface Performance { ready: boolean; hours?: number; routes?: RouteTiming[] }

const PERIODS = [{ days: 1, label: '24 horas' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }]

/** Las rutas con las que se arman las dos pantallas que más importan: el feed y el detalle de una vacante. */
const KEY_ROUTES: { match: (route: RouteTiming) => boolean; label: string }[] = [
  { match: route => route.method === 'GET' && route.route === '/api/community/posts', label: 'Feed: lista de vacantes y discusiones' },
  { match: route => route.method === 'GET' && route.route === '/api/community/posts/editorial', label: 'Feed: artículos del equipo' },
  { match: route => route.method === 'GET' && route.route.startsWith('/api/community/feed'), label: 'Feed: «Para ti»' },
  { match: route => route.method === 'GET' && route.route === '/api/community/posts/:id', label: 'Vacante: detalle completo (con sesión)' },
  { match: route => route.method === 'GET' && route.route === '/api/community/seo/vacancy/:slug', label: 'Vacante: versión pública' },
  { match: route => route.method === 'GET' && route.route === '/api/community/posts/:id/related', label: 'Vacante: más de la empresa' },
  { match: route => route.method === 'GET' && route.route === '/api/community/stats', label: 'Cifras de la barra lateral' },
]

/** 850 -> "850 ms"; 2300 -> "2.3 s". Los percentiles son estimados («hasta»), por eso el signo. */
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s` : `${ms} ms`)

export default function VelocidadPage() {
  const [days, setDays] = useState(1)
  const { data, loading, error, reload } = usePanelData<Performance>(`/api/admin/analytics/performance?days=${days}`, { keepPrevious: true })
  const routes = data?.routes ?? []
  const key = KEY_ROUTES.map(item => ({ item, route: routes.find(item.match) })).filter(entry => entry.route)
  const slowest = [...routes].filter(route => route.requests >= 5).sort((a, b) => b.p95Ms - a.p95Ms)[0]
  const total = routes.reduce((sum, route) => sum + route.requests, 0)
  const slowCount = routes.filter(route => route.slow && route.requests >= 5).length

  return (
    <>
      <PageHeader title="Velocidad" subtitle="Cuánto tarda el servidor en cada ruta de la API, y dónde se va el tiempo. Para acelerar algo primero hay que saber qué es lo lento.">
        <div className="panel-period" role="group" aria-label="Periodo">
          {PERIODS.map(option => (
            <button key={option.days} type="button" className={days === option.days ? 'active' : ''} aria-pressed={days === option.days} onClick={() => setDays(option.days)}>{option.label}</button>
          ))}
        </div>
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady migration="api-timing-migration.sql" />}

      {data?.ready && (
        <>
          {routes.length === 0 ? (
            <Card title="Todavía no hay mediciones"><Empty>El servidor guarda un resumen cada minuto; en unos minutos de uso aparece aquí.</Empty></Card>
          ) : (
            <>
              <div className="panel-grid cols-3">
                <Stat label="Peticiones medidas" value={fmtNum(total)} caption="Todas las rutas de la API en el periodo." />
                <Stat label="Rutas lentas" value={fmtNum(slowCount)} caption="Su p95 pasa de 1 segundo (con al menos 5 peticiones)." tone={slowCount > 0 ? 'warn' : undefined} />
                <Stat label="La más lenta (p95)" value={slowest ? `≤ ${fmtMs(slowest.p95Ms)}` : '—'} caption={slowest ? `${slowest.method} ${slowest.route}` : 'Aún no hay rutas con suficientes peticiones.'} />
              </div>

              <Card title="Feed y vacante" hint="Las rutas con las que se arman las dos pantallas que se sienten lentas">
                {key.length === 0 ? <Empty>Todavía no hay peticiones de estas rutas en el periodo.</Empty> : (
                  <table className="panel-table">
                    <thead><tr><th>Qué carga</th><th className="num">Peticiones</th><th className="num">Mediana</th><th className="num">p95</th><th className="num">Máximo</th><th className="num">Errores</th><th className="num">% del tiempo</th></tr></thead>
                    <tbody>
                      {key.map(({ item, route }) => route && (
                        <tr key={`${route.method} ${route.route}`}>
                          <td><b>{item.label}</b><div className="panel-muted">{route.method} {route.route}</div></td>
                          <td className="num">{fmtNum(route.requests)}</td>
                          <td className="num">≤ {fmtMs(route.p50Ms)}</td>
                          <td className="num" style={{ color: route.slow ? '#b91c1c' : undefined, fontWeight: route.slow ? 700 : 400 }}>≤ {fmtMs(route.p95Ms)}</td>
                          <td className="num">{fmtMs(route.maxMs)}</td>
                          <td className="num">{route.errors > 0 ? `${fmtNum(route.errors)} (${route.errorPct}%)` : '0'}</td>
                          <td className="num">{route.sharePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card title="Todas las rutas" hint="La que consume más tiempo de servidor primero">
                <DataTable
                  rows={routes}
                  rowKey={route => `${route.method} ${route.route}`}
                  searchText={route => `${route.method} ${route.route}`}
                  searchLabel="Buscar una ruta"
                  head={<tr><th>Ruta</th><th className="num">Peticiones</th><th className="num">Promedio</th><th className="num">Mediana</th><th className="num">p95</th><th className="num">Máximo</th><th className="num">Errores</th><th className="num">Tiempo total</th><th className="num">% del tiempo</th></tr>}
                  renderRow={route => (
                    <tr>
                      <td><b>{route.method}</b> {route.route}</td>
                      <td className="num">{fmtNum(route.requests)}</td>
                      <td className="num">{fmtMs(route.avgMs)}</td>
                      <td className="num">≤ {fmtMs(route.p50Ms)}</td>
                      <td className="num" style={{ color: route.slow ? '#b91c1c' : undefined, fontWeight: route.slow ? 700 : 400 }}>≤ {fmtMs(route.p95Ms)}</td>
                      <td className="num">{fmtMs(route.maxMs)}</td>
                      <td className="num">{route.errors > 0 ? `${fmtNum(route.errors)} (${route.errorPct}%)` : '0'}</td>
                      <td className="num">{fmtMs(route.totalSeconds * 1000)}</td>
                      <td className="num">{route.sharePct}%</td>
                    </tr>
                  )}
                />
              </Card>
            </>
          )}

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Cada petición a la API se mide en el servidor desde que llega hasta que sale la respuesta, y cada minuto se guarda un resumen por hora y ruta (sin guardar peticiones sueltas ni datos de personas).
            La <b>mediana</b> es lo que tarda una petición típica y el <b>p95</b> lo que tardan las más lentas (1 de cada 20 tarda más que eso); son estimados con rangos de tiempo, por eso dicen «hasta». Una ruta es <b>lenta</b> si su p95 pasa de 1 segundo.
            «% del tiempo» es la parte del tiempo total del servidor que consume esa ruta: una ruta rápida pero muy usada puede pesar más que una lenta que casi nadie abre.
            Esto es solo el servidor. Lo que tarda la pantalla en estar lista en el navegador de la persona (feed y vacante) está en <Link href="/panel/trafico/flujos">Flujos críticos</Link>, como «Ver el feed» y «Ver una vacante».
          </p>
        </>
      )}
    </>
  )
}

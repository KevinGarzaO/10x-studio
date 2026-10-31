'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarSeries, Card, Empty, ErrorBox, fmtNum, fmtPct, Loading, PageHeader, PeriodPicker, Stat, usePanelData } from '@/components/panel/ui'
import { TrafficNotReady } from '@/components/panel/traffic'
import { SegmentSummary, type SegmentCounts } from '@/components/panel/segments'

interface WebTraffic {
  ready: boolean
  days?: number
  summary?: { dau: number; wau: number; mau: number; sessions: number; engagementRatePct: number | null; conversions: number; conversionRatePct: number | null }


  daily?: { day: string; dau: number; wau: number; mau: number }[]
}

const SCREENS = [
  { href: '/panel/trafico/en-vivo', title: 'En vivo', text: 'Quién está en el sitio ahora mismo y en qué página.' },
  { href: '/panel/trafico/sesiones', title: 'Sesiones', text: 'Cada entrada al sitio, una por una, con todo lo que sabemos de ella.' },
  { href: '/panel/trafico/geografia', title: 'Geografía', text: 'El mapa: países, regiones y ciudades.' },
  { href: '/panel/trafico/audiencia', title: 'Audiencia', text: 'Idioma, dispositivo, sistema, navegador, pantalla y zona horaria.' },
  { href: '/panel/trafico/paginas', title: 'Páginas', text: 'Cada página vista, por dónde entran y por dónde salen.' },
  { href: '/panel/trafico/canales', title: 'Canales', text: 'De dónde llegan: origen, medio, campaña y sitio.' },
  { href: '/panel/trafico/embudo', title: 'Embudo y eventos', text: 'El recorrido del candidato y cada evento.' },
  { href: '/panel/trafico/cohortes', title: 'Cohortes', text: 'Quién vuelve, por semana de adquisición.' },
  { href: '/panel/trafico/retencion', title: 'Retención', text: 'Quién usa AvoTalent, quién volvió y con qué frecuencia.' },
]

export default function TraficoPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<WebTraffic>(`/api/admin/analytics/web?days=${days}`, { keepPrevious: true })
  const people = usePanelData<{ ready: boolean; trackingSince?: string | null; partial?: boolean; groups?: Record<string, SegmentCounts[]> }>(`/api/admin/analytics/web/segments?list=all&days=${days}`, { keepPrevious: true })
  const all = people.data?.groups?.all?.[0]

  return (
    <>
      <PageHeader title="Tráfico web" subtitle="La analítica propia de AvoTalent, con las reglas de GA4: sesiones, personas activas, de dónde llegan y qué hacen.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <TrafficNotReady />}

      {data?.ready && data.summary && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Activos hoy" value={fmtNum(data.summary.dau)} caption="Personas distintas con al menos una sesión activa hoy (DAU)." />
            <Stat label="Activos en 7 días" value={fmtNum(data.summary.wau)} caption="Personas distintas con una sesión activa en los últimos 7 días (WAU)." />
            <Stat label="Activos en 30 días" value={fmtNum(data.summary.mau)} caption="Personas distintas con una sesión activa en los últimos 30 días (MAU)." />
          </div>

          {all
            ? <SegmentSummary segments={all} trackingSince={people.data?.trackingSince} partial={people.data?.partial} />
            : <Card title="Quién entra"><p className="panel-muted">Falta aplicar la migración <b>web-analytics-segments-migration.sql</b> en Supabase para separar a las personas nuevas de las recurrentes, las activas de las que solo visitaron y las registradas de las anónimas.</p></Card>}

          <Card title="Personas activas por día" hint="DAU, WAU y MAU">
            {!data.daily || data.daily.length === 0 ? <Empty>Aún no hay visitas.</Empty> : (
              <BarSeries
                points={data.daily.map(row => ({ day: row.day, dau: row.dau, wau: row.wau, mau: row.mau }))}
                series={[{ key: 'dau', label: 'Día', color: '#10b981' }, { key: 'wau', label: '7 días', color: '#0ea5e9' }, { key: 'mau', label: '30 días', color: '#6366f1' }]}
              />
            )}
          </Card>

          <Card title="El detalle" hint="Cada pantalla de este módulo">
            <div className="panel-shortcuts">
              {SCREENS.map(screen => (
                <Link key={screen.href} href={screen.href} className="panel-shortcut">
                  <b>{screen.title}</b>
                  <span>{screen.text}</span>
                </Link>
              ))}
            </div>
          </Card>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una <b>sesión activa</b> cumple al menos una: 10 segundos con la pestaña visible, 2 o más páginas vistas, o un evento clave (registro, clic en postularse, perfil completo).
            Una sesión nueva empieza tras 30 minutos sin actividad. Una <b>persona</b> es su cuenta si ya la reconocimos (al registrarse o iniciar sesión se unen sus visitas anónimas anteriores) y, si no, su navegador.
            No cuenta al equipo, las cuentas de prueba ni los robots, y los días son de Monterrey. Esta medición corre en paralelo a la de Adquisición y Retención hasta que las cifras cuadren; no esperes que coincida
            exactamente con GA4: GA4 aplica sus propios filtros de robots y umbrales.
          </p>
        </>
      )}
    </>
  )
}

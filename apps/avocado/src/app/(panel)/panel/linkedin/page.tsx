'use client'

import { DataTable } from '@/components/panel/DataTable'
import { useState } from 'react'
import { backendBase } from '@/lib/admin-auth'
import { Card, Empty, ErrorBox, fmtDate, fmtNum, fmtPct, InlineBar, Loading, PageHeader, PeriodPicker, roleLabel, Stat, usePanelData } from '@/components/panel/ui'
import { SegmentSummary, SegmentsNotReady, type SegmentCounts } from '@/components/panel/segments'

interface Status {
  connected: boolean; name: string | null; headline: string | null; expiresAt: string | null; daysLeft: number | null
  publishing: boolean; siteUrlConfigured: boolean; nextPublicationAt: string
}

/** Con LA distinción de personas en cada publicación y en cada grupo. */
interface SegmentGroup { key: string; posts: number; peoplePerPost: number; segments: SegmentCounts }
interface SegmentLinkedIn {
  days: number
  source: 'segments'
  trackingSince: string | null
  partial: boolean
  status: Status
  totals: { published: number; failed: number; segments: SegmentCounts | null }
  posts: { slug: string | null; company: string | null; role: string | null; publishedAt: string | null; linkedinPostId: string | null; segments: SegmentCounts }[]
  byRole: SegmentGroup[]
  byHour: SegmentGroup[]
  byCompany: SegmentGroup[]
}

/** La cuenta anterior, por navegador y sin saber si la persona hizo algo: solo mientras no exista la medición nueva. */
interface LegacyGroup { key: string; posts: number; visitors: number; signups: number; visitorsPerPost: number; conversionPct: number | null }
interface LegacyLinkedIn {
  days: number
  source: 'legacy'
  status: Status
  totals: { published: number; failed: number; visitors: number; signups: number }
  posts: { slug: string | null; company: string | null; role: string | null; publishedAt: string | null; linkedinPostId: string | null; visitors: number; signups: number; conversionPct: number | null }[]
  byRole: LegacyGroup[]
  byHour: LegacyGroup[]
  byCompany: LegacyGroup[]
}

type LinkedInData = SegmentLinkedIn | LegacyLinkedIn

/** Las personas de cada publicación (o grupo) con la distinción, en columnas. */
function PeopleCells({ segments }: { segments: SegmentCounts }) {
  return (
    <>
      <td className="num"><b>{fmtNum(segments.active)}</b><span className="panel-muted panel-seg-pair" style={{ display: 'block' }}>de {fmtNum(segments.people)}</span></td>
      <td style={{ minWidth: 150 }}><b>{fmtNum(segments.newPeople)}</b><span className="panel-muted panel-seg-pair"> {fmtNum(segments.newActive)} activas · {fmtNum(segments.newVisitOnly)} solo visita</span></td>
      <td className="num">{fmtNum(segments.returningPeople)}<span className="panel-muted panel-seg-pair" style={{ display: 'block' }}>{fmtNum(segments.returningActive)} activas</span></td>
      <td className="num">{fmtNum(segments.registered)}</td>
      <td className="num">{fmtPct(segments.conversionPct)}{segments.newActive > 0 && <span className="panel-muted panel-seg-pair" style={{ display: 'block' }}>{fmtNum(segments.registeredNew)} de {fmtNum(segments.newActive)}</span>}</td>
    </>
  )
}

const PEOPLE_HEAD = <><th className="num">Activas</th><th>Nuevas</th><th className="num">Recurrentes</th><th className="num">Registradas</th><th className="num">Conversión de nuevas</th></>

function SegmentGroups({ title, hint, rows, label }: { title: string; hint: string; rows: SegmentGroup[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map(row => row.peoplePerPost))
  return (
    <Card title={title} hint={hint}>
      {rows.length === 0 ? <Empty>Aún no hay publicaciones para comparar.</Empty> : (
        <DataTable
          rows={rows}
          rowKey={row => row.key}
          searchText={row => label(row.key)}
          searchLabel={`Buscar ${title.replace('Por ', '').toLowerCase()}`}
          head={<tr><th>{title.replace('Por ', '')}</th><th className="num">Posts</th><th>Personas por post</th>{PEOPLE_HEAD}</tr>}
          renderRow={row => (
            <tr>
              <td>{label(row.key)}</td>
              <td className="num">{row.posts}</td>
              <td style={{ minWidth: 150 }}><InlineBar value={row.peoplePerPost} max={max} /> <span className="panel-muted">{fmtNum(row.peoplePerPost)}</span></td>
              <PeopleCells segments={row.segments} />
            </tr>
          )}
        />
      )}
    </Card>
  )
}

function Groups({ title, hint, rows, label }: { title: string; hint: string; rows: LegacyGroup[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map(row => row.visitorsPerPost))
  return (
    <Card title={title} hint={hint}>
      {rows.length === 0 ? <Empty>Aún no hay publicaciones para comparar.</Empty> : (
        <DataTable
          rows={rows}
          rowKey={row => row.key}
          searchText={row => label(row.key)}
          searchLabel={`Buscar ${title.replace('Por ', '').toLowerCase()}`}
          head={<tr><th>{title.replace('Por ', '')}</th><th className="num">Posts</th><th>Visitantes por post</th><th className="num">Registros</th></tr>}
          renderRow={row => (
            <tr>
              <td>{label(row.key)}</td>
              <td className="num">{row.posts}</td>
              <td style={{ minWidth: 150 }}><InlineBar value={row.visitorsPerPost} max={max} /> <span className="panel-muted">{fmtNum(row.visitorsPerPost)}</span></td>
              <td className="num">{row.signups}</td>
            </tr>
          )}
        />
      )}
    </Card>
  )
}

export default function LinkedInPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = usePanelData<LinkedInData>(`/api/admin/analytics/linkedin?days=${days}`)

  // Reconectar abre la ventana de LinkedIn; al terminar, el backend ya guardó la sesión: solo se vuelve a leer el estado.
  function connect() {
    const popup = window.open(`${backendBase()}/api/linkedin/auth`, 'linkedin-oauth', 'width=600,height=700,scrollbars=yes')
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LINKEDIN_AUTH') {
        window.removeEventListener('message', onMessage)
        popup?.close()
        reload()
      }
    }
    window.addEventListener('message', onMessage)
  }

  const status = data?.status
  const expiring = status?.daysLeft !== null && status?.daysLeft !== undefined && status.daysLeft <= 14

  return (
    <>
      <PageHeader title="LinkedIn" subtitle="Cada publicación de vacante, y cuánta gente y cuántos registros trajo por su enlace.">
        <PeriodPicker days={days} onChange={setDays} />
      </PageHeader>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && status && (
        <>
          <div className={`panel-banner ${!status.connected ? 'bad' : !status.publishing || expiring ? 'warn' : 'ok'}`}>
            <div className="panel-banner-main">
              <strong>
                {!status.connected ? 'LinkedIn no está conectado' : status.publishing ? 'Publicando automáticamente' : 'Conectado, pero la publicación automática está apagada'}
              </strong>
              <span>
                {status.connected && <>Cuenta de {status.name}. {status.daysLeft !== null && (status.daysLeft >= 0 ? `El permiso vence en ${status.daysLeft} días. ` : 'El permiso ya venció. ')}</>}
                {status.publishing && status.connected && <>Próxima publicación: {fmtDate(status.nextPublicationAt, true)}. </>}
                {!status.publishing && 'Para encenderla agrega LINKEDIN_VACANCY_POSTS=on en el servidor. '}
                {!status.siteUrlConfigured && 'Falta configurar COMMUNITY_APP_URL con la dirección pública del sitio.'}
              </span>
            </div>
            <button type="button" className="panel-btn primary" onClick={connect}>{status.connected ? 'Reconectar' : 'Conectar LinkedIn'}</button>
          </div>

          {data.source === 'legacy' ? (
            <>
              <SegmentsNotReady />
              <div className="panel-grid cols-4">
                <Stat label="Publicadas" value={fmtNum(data.totals.published)} caption="Vacantes que salieron en tu perfil en este periodo." />
                <Stat label="Fallidas" value={fmtNum(data.totals.failed)} tone={data.totals.failed > 0 ? 'warn' : undefined} caption={data.totals.failed > 0 ? 'No se publicaron: se reintentan solas.' : 'Ninguna falló.'} />
                <Stat label="Visitantes" value={fmtNum(data.totals.visitors)} caption="Navegadores distintos por publicación (sin filtrar por actividad)." />
                <Stat label="Registros" value={fmtNum(data.totals.signups)} caption={`Conversión de ${fmtPct(data.totals.visitors > 0 ? Math.round((data.totals.signups / data.totals.visitors) * 1000) / 10 : null)}.`} />
              </div>

              <Card title="Cada publicación" hint="La más reciente primero">
                {data.posts.length === 0 ? <Empty>Todavía no hay publicaciones en este periodo.</Empty> : (
                  <DataTable
                    rows={data.posts}
                    rowKey={post => `${post.slug}-${post.publishedAt}`}
                    searchText={post => `${post.company ?? ''} ${roleLabel(post.role)}`}
                    searchLabel="Buscar empresa o rol"
                    head={<tr><th>Fecha</th><th>Empresa</th><th>Rol</th><th className="num">Visitantes</th><th className="num">Registros</th><th className="num">Conversión</th><th /></tr>}
                    renderRow={post => (
                      <tr>
                        <td>{fmtDate(post.publishedAt, true)}</td>
                        <td>{post.company ?? '—'}</td>
                        <td><span className="panel-chip">{roleLabel(post.role)}</span></td>
                        <td className="num">{fmtNum(post.visitors)}</td>
                        <td className="num">{fmtNum(post.signups)}</td>
                        <td className="num">{fmtPct(post.conversionPct)}</td>
                        <td>{post.linkedinPostId && <a href={`https://www.linkedin.com/feed/update/${post.linkedinPostId}`} target="_blank" rel="noopener noreferrer">Ver en LinkedIn ↗</a>}</td>
                      </tr>
                    )}
                  />
                )}
              </Card>

              <div className="panel-grid cols-2">
                <Groups title="Por rol" hint="Qué tipo de vacante atrae más" rows={data.byRole} label={roleLabel} />
                <Groups title="Por hora" hint="Hora de Monterrey" rows={data.byHour} label={key => key} />
              </div>
              <Groups title="Por empresa" hint="Las 10 con más visitantes por publicación" rows={data.byCompany} label={key => key} />
            </>
          ) : (
            <>
              <div className="panel-grid cols-3">
                <Stat label="Publicadas" value={fmtNum(data.totals.published)} caption="Vacantes que salieron en tu perfil en este periodo." />
                <Stat label="Fallidas" value={fmtNum(data.totals.failed)} tone={data.totals.failed > 0 ? 'warn' : undefined} caption={data.totals.failed > 0 ? 'No se publicaron: se reintentan solas.' : 'Ninguna falló.'} />
                <Stat label="Usuarios activos de LinkedIn" value={fmtNum(data.totals.segments?.active ?? 0)} caption={`De ${fmtNum(data.totals.segments?.people ?? 0)} personas que llegaron por LinkedIn, esas hicieron algo en el sitio.`} tone="good" />
              </div>
              {data.totals.segments && <SegmentSummary segments={data.totals.segments} title="Quién llega desde LinkedIn" hint="Personas distintas de todas las publicaciones" trackingSince={data.trackingSince} partial={data.partial} />}

              <Card title="Cada publicación" hint="La más reciente primero · personas que llegaron por su enlace">
                {data.posts.length === 0 ? <Empty>Todavía no hay publicaciones en este periodo.</Empty> : (
                  <DataTable
                    rows={data.posts}
                    rowKey={post => `${post.slug}-${post.publishedAt}`}
                    searchText={post => `${post.company ?? ''} ${roleLabel(post.role)}`}
                    searchLabel="Buscar empresa o rol"
                    head={<tr><th>Fecha</th><th>Empresa</th><th>Rol</th>{PEOPLE_HEAD}<th /></tr>}
                    renderRow={post => (
                      <tr>
                        <td>{fmtDate(post.publishedAt, true)}</td>
                        <td>{post.company ?? '—'}</td>
                        <td><span className="panel-chip">{roleLabel(post.role)}</span></td>
                        <PeopleCells segments={post.segments} />
                        <td>{post.linkedinPostId && <a href={`https://www.linkedin.com/feed/update/${post.linkedinPostId}`} target="_blank" rel="noopener noreferrer">Ver en LinkedIn ↗</a>}</td>
                      </tr>
                    )}
                  />
                )}
              </Card>

              <div className="panel-grid cols-2">
                <SegmentGroups title="Por rol" hint="Qué tipo de vacante atrae más" rows={data.byRole} label={roleLabel} />
                <SegmentGroups title="Por hora" hint="Hora de Monterrey" rows={data.byHour} label={key => key} />
              </div>
              <SegmentGroups title="Por empresa" hint="Las 10 con más personas por publicación" rows={data.byCompany} label={key => key} />
            </>
          )}

          <p className="panel-defs">
            <b>Límite de la medición.</b> LinkedIn no entrega impresiones ni reacciones de un perfil personal, así que aquí solo se mide lo que llega a tu sitio:
            las personas que entraron por el enlace de cada publicación. Una publicación con pocas personas no necesariamente se vio poco en LinkedIn. <b>Activa</b> es quien hizo algo en el sitio; <b>solo visita</b>, quien entró y se fue.
            <b> Nueva</b> es quien entra por primera vez en el periodo y <b>recurrente</b> quien ya había entrado; la conversión mide cuántas nuevas se registraron entre las nuevas activas. Una persona que visitó dos publicaciones cuenta en las dos.
          </p>
        </>
      )}
    </>
  )
}

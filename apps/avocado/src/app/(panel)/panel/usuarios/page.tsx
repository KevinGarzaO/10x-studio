'use client'

import { useEffect, useState } from 'react'
import { Avatar, Card, Empty, ErrorBox, fmtDate, fmtNum, Loading, PageHeader, roleLabel, Stat, usePanelData } from '@/components/panel/ui'

interface UsersData {
  total: number
  completed: number
  matching: number
  page: number
  pageSize: number
  activityTracked: boolean
  byKind: { name: string; total: number }[]
  byRole: { name: string; total: number }[]
  bySource: { name: string; total: number }[]
  byProvider: { name: string; total: number }[]
  users: {
    id: string; username: string | null; display_name: string | null; email: string | null; photo_url: string | null; user_kind: string
    profile_completed: boolean | null; role_category: string | null; seniority: string | null; location: string | null
    provider: string | null; signup_source: string | null; created_at: string; lastActive: string | null
  }[]
}

const KIND: Record<string, string> = { user: 'Candidato', company: 'Empresa', superadmin: 'Administrador' }
const LEVEL: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }
// Con qué método se registró (y entra) la cuenta.
const PROVIDER: Record<string, string> = { email: 'Correo', github: 'GitHub', linkedin: 'LinkedIn' }
const PAGE_SIZE = 25

function Breakdown({ title, rows, label }: { title: string; rows: { name: string; total: number }[]; label?: (name: string) => string }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty>Sin datos.</Empty> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {rows.map(row => (
            <li key={row.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{label ? label(row.name) : row.name}</span>
              <b>{row.total}</b>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function UsuariosPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [provider, setProvider] = useState('')
  const [page, setPage] = useState(1)

  // La búsqueda espera a que se deje de teclear; cualquier cambio de filtro vuelve a la primera página.
  useEffect(() => {
    const timer = setTimeout(() => { setQ(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (q) params.set('q', q)
  if (provider) params.set('provider', provider)
  const { data, loading, refreshing, error, reload } = usePanelData<UsersData>(`/api/admin/analytics/users?${params}`, { keepPrevious: true })

  const pages = data ? Math.max(1, Math.ceil(data.matching / data.pageSize)) : 1
  const firstShown = data && data.matching > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const lastShown = data ? Math.min(data.page * data.pageSize, data.matching) : 0

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Las cuentas reales de AvoTalent, sin las de prueba ni los perfiles que crea el scraper." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Cuentas" value={fmtNum(data.total)} caption="Todas las cuentas reales." />
            <Stat label="Con perfil completo" value={fmtNum(data.completed)} caption="Foto, puesto, nivel, ubicación, modalidad y al menos un skill." />
            <Stat label="Sin completar" value={fmtNum(data.total - data.completed)} tone={data.total - data.completed > 0 ? 'warn' : undefined} caption="Se registraron pero no terminaron el perfil." />
          </div>

          <div className="panel-grid cols-3">
            <Breakdown title="Por tipo" rows={data.byKind} label={name => KIND[name] ?? name} />
            <Breakdown title="Por rol" rows={data.byRole} label={roleLabel} />
            <Breakdown title="Cómo se registraron" rows={data.byProvider} label={name => PROVIDER[name] ?? name} />
          </div>

          <div className="panel-grid cols-3">
            <Breakdown title="Por origen" rows={data.bySource} />
          </div>

          <Card title="Cuentas" hint={data.activityTracked ? 'Con su último día de actividad' : 'La actividad aún no se registra'}>
            <div className="panel-toolbar">
              <input
                className="panel-search"
                type="search"
                placeholder="Buscar por nombre, usuario o correo"
                aria-label="Buscar cuentas"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <div className="panel-filter" role="group" aria-label="Cómo se registraron">
                {[['', 'Todos'], ['email', 'Correo'], ['github', 'GitHub'], ['linkedin', 'LinkedIn']].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={provider === value} onClick={() => { setProvider(value); setPage(1) }}>{label}</button>
                ))}
              </div>
            </div>

            <div className={refreshing ? 'panel-refreshing' : undefined} aria-busy={refreshing}>
            {data.users.length === 0 ? <Empty>{q || provider ? 'Ninguna cuenta coincide con la búsqueda.' : 'Aún no hay cuentas.'}</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead><tr><th>Nombre</th><th>Tipo</th><th>Registro con</th><th>Rol</th><th>Nivel</th><th>Ubicación</th><th>Origen</th><th>Perfil</th><th>Registro</th><th>Última actividad</th></tr></thead>
                  <tbody>
                    {data.users.map(user => (
                      <tr key={user.id}>
                        <td>
                          <div className="panel-person">
                            <Avatar name={user.display_name || user.username || ''} photo={user.photo_url} />
                            <div>
                              <b>{user.display_name || user.username || '—'}</b>
                              <div className="panel-muted" style={{ fontSize: 12 }}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{KIND[user.user_kind] ?? user.user_kind}</td>
                        <td><span className="panel-chip">{PROVIDER[user.provider ?? 'email'] ?? user.provider}</span></td>
                        <td>{roleLabel(user.role_category)}</td>
                        <td>{LEVEL[user.seniority ?? ''] ?? '—'}</td>
                        <td>{user.location ?? '—'}</td>
                        <td><span className="panel-chip">{user.signup_source ?? '(directo)'}</span></td>
                        <td><span className={`panel-chip ${user.profile_completed ? 'good' : 'warn'}`}>{user.profile_completed ? 'Completo' : 'Incompleto'}</span></td>
                        <td>{fmtDate(user.created_at)}</td>
                        <td>{user.lastActive ? fmtDate(`${user.lastActive}T12:00:00Z`) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            </div>

            <div className="panel-pager">
              <span>{data.matching > 0 ? `${firstShown}–${lastShown} de ${fmtNum(data.matching)}` : 'Sin resultados'}</span>
              <div>
                <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</button>
                <button type="button" disabled={data.page >= pages} onClick={() => setPage(data.page + 1)}>Siguiente</button>
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  )
}

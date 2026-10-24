'use client'

import { Avatar, Card, Empty, ErrorBox, fmtDate, fmtNum, Loading, PageHeader, roleLabel, Stat, usePanelData } from '@/components/panel/ui'

interface UsersData {
  total: number
  activityTracked: boolean
  byKind: { name: string; total: number }[]
  byRole: { name: string; total: number }[]
  bySource: { name: string; total: number }[]
  users: {
    id: string; username: string | null; display_name: string | null; email: string | null; photo_url: string | null; user_kind: string
    profile_completed: boolean | null; role_category: string | null; seniority: string | null; location: string | null
    signup_source: string | null; created_at: string; lastActive: string | null
  }[]
}

const KIND: Record<string, string> = { user: 'Candidato', company: 'Empresa', superadmin: 'Administrador' }
const LEVEL: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }

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
  const { data, loading, error, reload } = usePanelData<UsersData>('/api/admin/analytics/users?limit=200')
  const completed = data ? data.users.filter(user => user.profile_completed).length : 0

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Las cuentas reales de AvoTalent, sin las de prueba ni los perfiles que crea el scraper." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-3">
            <Stat label="Cuentas" value={fmtNum(data.total)} caption="Las más recientes, hasta 200." />
            <Stat label="Con perfil completo" value={fmtNum(completed)} caption="Foto, puesto, nivel, ubicación, modalidad y al menos un skill." />
            <Stat label="Sin completar" value={fmtNum(data.total - completed)} tone={data.total - completed > 0 ? 'warn' : undefined} caption="Se registraron pero no terminaron el perfil." />
          </div>

          <div className="panel-grid cols-3">
            <Breakdown title="Por tipo" rows={data.byKind} label={name => KIND[name] ?? name} />
            <Breakdown title="Por rol" rows={data.byRole} label={roleLabel} />
            <Breakdown title="Por origen" rows={data.bySource} />
          </div>

          <Card title="Cuentas" hint={data.activityTracked ? 'Con su último día de actividad' : 'La actividad aún no se registra'}>
            {data.users.length === 0 ? <Empty>Aún no hay cuentas.</Empty> : (
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead><tr><th>Nombre</th><th>Tipo</th><th>Rol</th><th>Nivel</th><th>Ubicación</th><th>Origen</th><th>Perfil</th><th>Registro</th><th>Última actividad</th></tr></thead>
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
          </Card>
        </>
      )}
    </>
  )
}

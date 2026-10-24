'use client'

import { useRouter } from 'next/navigation'
import { clearSession } from '@/lib/admin-auth'
import { Avatar, Card, ErrorBox, Loading, PageHeader, usePanelData } from '@/components/panel/ui'
import { SITE_URL, type AdminMe } from '@/components/panel/AccountMenu'

const DEFINITIONS: { term: string; text: string }[] = [
  { term: 'Visitante', text: 'Un navegador distinto, no una entrada: quien vuelve cinco veces cuenta una vez.' },
  { term: 'Registro', text: 'Una cuenta real: sin cuentas de prueba, sin perfiles del scraper y sin las del equipo.' },
  { term: 'Conversión', text: 'Registros entre visitantes del mismo periodo.' },
  { term: 'Activo', text: 'Una persona real que hizo cualquier petición con sesión ese día. El equipo no cuenta.' },
  { term: 'Día', text: 'Hora de Monterrey (UTC-6), no UTC.' },
  { term: 'Match', text: 'Una vacante encaja desde 42 % y es buena desde 70 %: el mismo cálculo de "Para ti".' },
]

export default function ConfiguracionPage() {
  const router = useRouter()
  const { data, loading, error, reload } = usePanelData<AdminMe>('/api/admin/analytics/me')
  const name = data?.user?.displayName || data?.user?.username || 'Administrador'

  return (
    <>
      <PageHeader title="Configuración" subtitle="Tu cuenta de administrador y cómo se calculan las cifras del panel." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className="panel-grid cols-2">
          <Card title="Tu cuenta">
            <div className="panel-person" style={{ marginBottom: 14 }}>
              <Avatar name={name} photo={data.user?.photoUrl ?? null} />
              <div>
                <strong>{name}</strong>
                {data.user?.username && <div className="panel-muted" style={{ fontSize: 13 }}>@{data.user.username}</div>}
              </div>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 12px', margin: 0, fontSize: 14 }}>
              <dt className="panel-muted">Correo</dt><dd style={{ margin: 0 }}>{data.user?.email ?? '—'}</dd>
              <dt className="panel-muted">Permiso</dt><dd style={{ margin: 0 }}>Administrador</dd>
            </dl>
            <p className="panel-muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
              El nombre, la foto y el correo se cambian en AvoTalent, en Configuración de tu perfil. El permiso de administrador solo se da desde la base de datos.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <a className="panel-link-button" href={`${SITE_URL}/settings`} target="_blank" rel="noreferrer">Editar mi perfil</a>
              <button type="button" className="panel-link-button" onClick={() => { clearSession(); router.replace('/login') }}>Cerrar sesión</button>
            </div>
          </Card>

          <Card title="Cómo se miden las cifras">
            <dl style={{ margin: 0, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
              {DEFINITIONS.map(item => (
                <div key={item.term}><dt style={{ fontWeight: 700 }}>{item.term}</dt><dd style={{ margin: 0 }} className="panel-muted">{item.text}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </>
  )
}

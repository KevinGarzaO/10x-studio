'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, FormEvent } from 'react'
import {
  ArrowLeft, Bell, Bookmark, Check, Globe2, LockKeyhole, Mail, Moon,
  Save, Settings, ShieldCheck, UserRound, MapPin, ExternalLink, Pencil,
  Eye, EyeOff, MessageCircle, Heart, Sparkles, GitBranch, Loader2
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const styles = `
.account-page{min-height:100vh;background:#0d1117;color:#e6edf3;padding:28px 24px}
.account-wrap{width:min(100%,1080px);margin:0 auto}
.account-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:34px}
.account-brand{font-weight:800;letter-spacing:-.04em;font-size:20px}
.account-brand span{color:#00A86B}
.back-link{color:#8b949e;text-decoration:none;font-size:12px;display:flex;align-items:center;gap:7px}
.back-link:hover{color:#00A86B}
.account-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px}
.account-menu{display:flex;flex-direction:column;gap:5px;position:sticky;top:24px;height:max-content}
.account-menu-label{color:#58636f;font:10px monospace;text-transform:uppercase;letter-spacing:.12em;padding:0 12px 10px}
.account-menu a{padding:11px 12px;border-radius:8px;color:#8b949e;text-decoration:none;font-size:13px;display:flex;gap:9px;align-items:center}
.account-menu a.active,.account-menu a:hover{background:#161b22;color:#e6edf3}
.account-menu a.active{box-shadow:inset 2px 0 #00A86B}
.account-card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:28px}
.page-kicker{color:#00A86B;font:11px monospace;text-transform:uppercase;letter-spacing:.08em;margin:0 0 9px}
.page-title{font-size:28px;letter-spacing:-.03em;margin:0}
.page-description{margin:8px 0 0}
.profile-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid #30363d}
.profile-identity{display:flex;align-items:center;gap:16px}
.big-avatar{width:76px;height:76px;border-radius:18px;display:grid;place-items:center;background:#123a32;color:#6ee7b7;border:1px solid #245848;font:700 20px monospace}
.profile-hero h1{font-size:25px;margin:0 0 5px}
.muted{color:#8b949e;font-size:13px;line-height:1.65}
.badge{display:inline-flex;align-items:center;gap:5px;color:#6ee7b7;background:#123a32;border:1px solid #245848;border-radius:99px;padding:4px 8px;font:10px monospace}
.section-title{font-size:15px;margin:25px 0 12px}
.profile-links{display:flex;gap:14px;margin-top:8px}
.profile-link{color:#8b949e;font-size:12px;display:flex;align-items:center;gap:5px}
.stat-row{display:flex;gap:18px;margin-bottom:24px}
.stat{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px 20px;min-width:100px}
.stat strong{display:block;font-size:22px;color:#e6edf3}
.stat span{font-size:11px;color:#8b949e}
.activity-list{display:flex;flex-direction:column;gap:10px}
.activity{display:flex;align-items:center;gap:12px;padding:12px;background:#161b22;border:1px solid #30363d;border-radius:10px}
.activity-icon{color:#00A86B;flex-shrink:0}
.activity strong{display:block;font-size:13px;color:#e6edf3}
.activity span{font-size:11px;color:#8b949e}
.button-row{display:flex;gap:10px;margin-top:16px}
.primary-btn{background:#00A86B;color:#0d1117;border:none;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.primary-btn:hover{background:#00c97b}
.outline-btn{background:transparent;color:#c9d1d9;border:1px solid #30363d;padding:9px 18px;border-radius:8px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.outline-btn:hover{border-color:#8b949e}
.form-grid{display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:12px;color:#8b949e;font-weight:500}
.field input,.field textarea{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#e6edf3;font-size:13px;font-family:inherit}
.field input:focus,.field textarea:focus{outline:none;border-color:#00A86B}
.field textarea{min-height:80px;resize:vertical}
.settings-section{margin-top:28px;padding-top:24px;border-top:1px solid #30363d}
.setting-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #21262d}
.setting-info{display:flex;align-items:center;gap:12px}
.setting-info strong{display:block;font-size:13px}
.setting-info span{font-size:11px;color:#8b949e}
.toggle{width:42px;height:24px;border-radius:12px;border:none;background:#21262d;cursor:pointer;position:relative;padding:0}
.toggle.on{background:#00A86B}
.toggle i{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:.2s}
.toggle.on i{left:21px}
.auth-page{min-height:100vh;background:#0d1117;color:#e6edf3;display:grid;place-items:center;padding:28px 24px;background-image:linear-gradient(#30363d16 1px,transparent 1px),linear-gradient(90deg,#30363d16 1px,transparent 1px);background-size:48px 48px}
.auth-shell{width:min(100%,980px);max-width:980px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,430px);gap:0;border:1px solid #30363d;border-radius:14px;overflow:hidden;background:#161b22;box-shadow:0 26px 90px #00000055}
.auth-shell>*{min-width:0;box-sizing:border-box}
.auth-aside{padding:38px;display:flex;flex-direction:column;justify-content:space-between;min-height:510px;background:#10231e;border-right:1px solid #245848}
.auth-logo{color:#e6edf3;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.04em}
.auth-logo span{color:#00A86B;margin-right:6px}
.auth-aside-copy{max-width:360px}
.auth-aside-copy h1{font-size:38px;line-height:1.06;letter-spacing:-.06em;margin:0 0 16px}
.auth-aside-copy .muted{color:#a6b7b0}
.auth-proof{border-top:1px solid #245848;padding-top:18px}
.proof-avatars{display:flex;margin-bottom:10px}
.proof-avatars span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#123a32;color:#6ee7b7;border:2px solid #10231e;margin-right:-7px;font:700 8px monospace}
.auth-proof p{font-size:11px;color:#8b949e;margin:0}
.auth-proof strong{color:#6ee7b7}
.auth-card{padding:38px 42px;background:#161b22;border:0!important;border-radius:0!important;box-shadow:none!important}
.auth-card .back-link{margin-bottom:28px}
.auth-heading{text-align:left;margin-bottom:25px}
.auth-heading h2{font-size:28px;letter-spacing:-.04em;margin:0 0 6px}
.auth-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#6ee7b7;background:#123a32;border:1px solid #245848;margin-bottom:18px}
.auth-error{background:#3d1214;border:1px solid #5c2225;border-radius:8px;padding:10px 14px;color:#f87171;font-size:12px;margin-bottom:14px}
.auth-success{background:#0d3320;border:1px solid #1a5c3a;border-radius:8px;padding:10px 14px;color:#6ee7b7;font-size:12px;margin-bottom:14px}
.auth-field{margin-bottom:16px}
.auth-field label{display:block;font-size:12px;color:#8b949e;margin-bottom:6px;font-weight:500}
.auth-field input{width:100%;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:11px 14px;color:#e6edf3;font-size:14px;box-sizing:border-box}
.auth-field input:focus{outline:none;border-color:#00A86B}
.auth-field input::placeholder{color:#484f58}
.auth-submit{width:100%;background:#00A86B;color:#0d1117;border:none;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px}
.auth-submit:hover{background:#00c97b}
.auth-submit:disabled{opacity:.6;cursor:not-allowed}
.auth-switch{margin-top:20px;text-align:center;font-size:13px;color:#8b949e}
.auth-switch a{color:#00A86B;text-decoration:none;font-weight:600}
.auth-switch a:hover{text-decoration:underline}
.auth-pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:#8b949e;cursor:pointer;padding:0}
.auth-field{position:relative}
@media(max-width:768px){.auth-shell{grid-template-columns:1fr}.auth-aside{display:none}.auth-card{padding:28px 24px}}
`

export function AccountLayout({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <div className="account-page">
      <style>{styles}</style>
      <div className="account-wrap">
        <div className="account-nav">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Volver a Avocado</Link>
          <div className="account-brand"><span>&gt;_</span> avocado</div>
        </div>
        <div className="account-grid">
          <nav className="account-menu" aria-label="Cuenta">
            <div className="account-menu-label">Tu espacio</div>
            <Link className={active === 'profile' ? 'active' : ''} href="/profile"><UserRound size={15} /> Perfil</Link>
            <Link className={active === 'settings' ? 'active' : ''} href="/settings"><Settings size={15} /> Configuración</Link>
            <Link className={active === 'saved' ? 'active' : ''} href="/saved"><Bookmark size={15} /> Guardados</Link>
            <Link className={active === 'notifications' ? 'active' : ''} href="/notifications"><Bell size={15} /> Notificaciones</Link>
          </nav>
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}

export function ProfilePage() {
  return (
    <AccountLayout active="profile">
      <section className="account-card">
        <div className="profile-hero">
          <div className="profile-identity">
            <div className="big-avatar">JD</div>
            <div>
              <p className="page-kicker">Perfil de comunidad</p>
              <h1>Javier Developer</h1>
              <p className="muted">@javierdev · <MapPin size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Ciudad de México · Se unió en 2024</p>
              <span className="badge"><ShieldCheck size={12} /> Miembro activo</span>
              <div className="profile-links">
                <span className="profile-link"><Globe2 size={13} /> javierdev.dev</span>
                <span className="profile-link"><GitBranch size={13} /> github.com/javierdev</span>
              </div>
            </div>
          </div>
          <div className="button-row">
            <Link className="primary-btn" href="/settings"><Pencil size={14} /> Editar perfil</Link>
            <button className="outline-btn"><ExternalLink size={14} /> Compartir</button>
          </div>
        </div>
        <h2 className="section-title">Sobre mí</h2>
        <p className="muted">Frontend engineer construyendo interfaces cuidadas con React, TypeScript y Next.js. Comparto lo que aprendo y busco conversaciones que ayuden a la comunidad.</p>
        <h2 className="section-title">Actividad en Avocado</h2>
        <div className="stat-row">
          <div className="stat"><strong>28</strong><span>publicaciones</span></div>
          <div className="stat"><strong>412</strong><span>reputación</span></div>
          <div className="stat"><strong>86</strong><span>siguiendo</span></div>
        </div>
        <h2 className="section-title">Actividad reciente</h2>
        <div className="activity-list">
          <div className="activity"><MessageCircle size={16} className="activity-icon" /><div><strong>Comentó en &quot;Cache Components en producción&quot;</strong><span>Hace 2 horas · 12 reacciones</span></div></div>
          <div className="activity"><Heart size={16} className="activity-icon" /><div><strong>Guardó una publicación de React</strong><span>Ayer · Frontend</span></div></div>
          <div className="activity"><Sparkles size={16} className="activity-icon" /><div><strong>Publicó &quot;Patrones para equipos pequeños&quot;</strong><span>Hace 3 días · 24 reacciones</span></div></div>
        </div>
      </section>
    </AccountLayout>
  )
}

export function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [dark, setDark] = useState(true)
  const [weekly, setWeekly] = useState(true)
  return (
    <AccountLayout active="settings">
      <section className="account-card">
        <p className="page-kicker">Tu espacio</p>
        <h1 className="page-title">Configuración</h1>
        <p className="muted page-description">Controla tu perfil público, preferencias y la forma en que Avocado se comunica contigo.</p>
        <h2 className="section-title">Perfil público</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="name">Nombre visible</label><input id="name" defaultValue="Javier Developer" /></div>
          <div className="field"><label htmlFor="handle">Usuario</label><input id="handle" defaultValue="@javierdev" /></div>
          <div className="field"><label htmlFor="bio">Biografía</label><textarea id="bio" defaultValue="Frontend engineer construyendo interfaces cuidadas con React, TypeScript y Next.js." /></div>
        </div>
        <div className="button-row"><button className="primary-btn" onClick={() => setSaved(true)}>{saved ? <><Check size={14} /> Cambios guardados</> : <><Save size={14} /> Guardar cambios</>}</button></div>
        <div className="settings-section">
          <h2 className="section-title">Preferencias</h2>
          <div className="setting-row"><div className="setting-info"><Moon size={17} /><div><strong>Tema oscuro</strong><span>Usar la apariencia técnica de Avocado.</span></div></div><button className={`toggle ${dark ? 'on' : ''}`} onClick={() => setDark(!dark)} aria-label="Cambiar tema"><i /></button></div>
          <div className="setting-row"><div className="setting-info"><Mail size={17} /><div><strong>Resumen semanal</strong><span>Recibe las conversaciones más relevantes.</span></div></div><button className={`toggle ${weekly ? 'on' : ''}`} onClick={() => setWeekly(!weekly)} aria-label="Activar resumen"><i /></button></div>
          <div className="setting-row"><div className="setting-info"><Bell size={17} /><div><strong>Notificaciones de respuestas</strong><span>Entérate cuando alguien responda tus publicaciones.</span></div></div><button className="toggle on" aria-label="Notificaciones"><i /></button></div>
        </div>
      </section>
    </AccountLayout>
  )
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const signup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (signup && !username.trim()) {
        setError('El username es requerido')
        setLoading(false)
        return
      }

      const endpoint = signup ? '/api/community/auth/signup' : '/api/community/auth/login'
      const body: Record<string, string> = { email, password }
      if (signup) {
        body.username = username.trim()
        body.displayName = displayName.trim() || username.trim()
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al procesar la solicitud')
        setLoading(false)
        return
      }

      if (data.session?.access_token) {
        localStorage.setItem('avocado_token', data.session.access_token)
        localStorage.setItem('avocado_user', JSON.stringify(data.user))
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <style>{styles}</style>
      <div className="auth-shell">
        <aside className="auth-aside">
          <Link href="/" className="auth-logo"><span>&gt;_</span> avocado</Link>
          <div className="auth-aside-copy">
            <p className="page-kicker">Comunidad de developers</p>
            <h1>{signup ? 'Construye tu siguiente gran idea.' : 'Las mejores conversaciones empiezan aquí.'}</h1>
            <p className="muted">{signup ? 'Comparte lo que sabes, encuentra colaboradores y crece junto a la comunidad.' : 'Vuelve a tus conversaciones, proyectos y oportunidades en Avocado.'}</p>
          </div>
          <div className="auth-proof">
            <div className="proof-avatars"><span>JD</span><span>ML</span><span>AS</span><span>+2k</span></div>
            <p><strong>2,400+</strong> developers construyendo juntos</p>
          </div>
        </aside>
        <main className="auth-card">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Volver al foro</Link>
          <div className="auth-heading">
            <div className="auth-icon"><LockKeyhole size={21} /></div>
            <p className="page-kicker">{signup ? 'Crear cuenta' : 'Acceso a la comunidad'}</p>
            <h2>{signup ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
            <p className="muted">{signup ? 'Únete en menos de un minuto.' : 'Continúa donde lo dejaste.'}</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <input id="auth-email" type="email" placeholder="tu@email.com" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {signup && (
              <div className="auth-field">
                <label htmlFor="auth-username">Username</label>
                <input id="auth-username" type="text" placeholder="tu_usuario" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} />
              </div>
            )}

            {signup && (
              <div className="auth-field">
                <label htmlFor="auth-displayname">Nombre para mostrar (opcional)</label>
                <input id="auth-displayname" type="text" placeholder="Tu Nombre" value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-password">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input id="auth-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: 40 }} />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Procesando...</> : signup ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="auth-switch">
            {signup ? (
              <>¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></>
            ) : (
              <>¿No tienes cuenta? <Link href="/signup">Regístrate gratis</Link></>
            )}
          </div>
        </main>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

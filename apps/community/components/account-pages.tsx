'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, FormEvent, useEffect } from 'react'
import {
  ArrowLeft, Bell, Bookmark, Check, Mail, Moon,
  Save, Settings, UserRound, MapPin, ExternalLink,
  Eye, EyeOff, MessageCircle, Heart, Loader2, Tag
} from 'lucide-react'
import { saveSession, getToken, fetchCurrentUser } from '../lib/session'
import { NotificationPrefs } from './notification-prefs'
import { SENIORITY_OPTIONS, MODALITY_OPTIONS, ROLE_CATEGORY_OPTIONS, ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'
import { PhotoPicker, SegmentedControl, SkillsInput, RoleCategorySelect } from './profile-form-fields'
import { useSkillCatalog, skillLabel } from '../lib/skill-catalog'
import { CvSettings } from './cv/CvSettings'
import { validateCandidateProfile, messageForField } from '../lib/profile-validation'
import { useSkillProposals } from '../lib/skill-proposals'
import { SkillProposalsList } from './skill-proposals-list'
import { ProfileGate } from './profile-gate'
import { getAttribution } from '../lib/attribution'
import { peekReturnTo } from '../lib/return-to'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface User {
  id: string
  username: string
  display_name: string
  email: string
  bio?: string
  photo_url?: string
  website?: string
  github_url?: string
  location?: string
  title?: string | null
  role_category?: string | null
  seniority?: string | null
  skills?: string[] | null
  work_modality?: string | null
  /** El CV tal como lo guardó el servidor, y si es visible en línea. */
  cv?: unknown
  cv_public?: boolean
  created_at: string
}

const styles = `
.account-page{min-height:100vh;background:var(--bg);color:var(--text);padding:28px 24px}
.account-wrap{width:min(100%,1080px);margin:0 auto}
.account-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:34px}
.account-brand{font-weight:800;letter-spacing:-.04em;font-size:20px}
.account-brand span{color:var(--brand)}
.account-brand .brand-avo{color:var(--text)}
.back-link{color:var(--text-muted);text-decoration:none;font-size:12px;display:flex;align-items:center;gap:7px}
.back-link:hover{color:var(--brand)}
.account-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px}
.account-menu{display:flex;flex-direction:column;gap:5px;position:sticky;top:24px;height:max-content}
.account-menu-label{color:#58636f;font:10px monospace;text-transform:uppercase;letter-spacing:.12em;padding:0 12px 10px}
.account-menu a{padding:11px 12px;border-radius:8px;color:var(--text-muted);text-decoration:none;font-size:13px;display:flex;gap:9px;align-items:center}
.account-menu a.active,.account-menu a:hover{background:var(--surface);color:var(--text)}
.account-menu a.active{box-shadow:inset 2px 0 var(--brand)}
.account-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px}
.page-kicker{color:var(--brand);font:11px monospace;text-transform:uppercase;letter-spacing:.08em;margin:0 0 9px}
.page-title{font-size:28px;letter-spacing:-.03em;margin:0}
.page-description{margin:8px 0 0}
.profile-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid var(--line)}
.profile-identity{display:flex;align-items:center;gap:16px}
.big-avatar{width:76px;height:76px;border-radius:18px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text);border:1px solid var(--accent-line);font:700 20px monospace}
.profile-hero h1{font-size:25px;margin:0 0 5px}
.muted{color:var(--text-muted);font-size:13px;line-height:1.65}
.badge{display:inline-flex;align-items:center;gap:5px;color:var(--accent-text);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:99px;padding:4px 8px;font:10px monospace}
.section-title{font-size:15px;margin:25px 0 12px}
.profile-links{display:flex;gap:14px;margin-top:8px}
.profile-link{color:var(--text-muted);font-size:12px;display:flex;align-items:center;gap:5px}
.stat-row{display:flex;gap:18px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 20px;min-width:100px}
.stat strong{display:block;font-size:22px;color:var(--text)}
.stat span{font-size:11px;color:var(--text-muted)}
.activity-list{display:flex;flex-direction:column;gap:10px}
.activity{display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.activity-icon{color:var(--brand);flex-shrink:0}
.activity strong{display:block;font-size:13px;color:var(--text)}
.activity span{font-size:11px;color:var(--text-muted)}
.button-row{display:flex;gap:10px;margin-top:16px}
.primary-btn{background:var(--brand);color:var(--bg);border:none;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.primary-btn:hover{background:var(--accent-hover)}
.outline-btn{background:transparent;color:var(--text-2);border:1px solid var(--line);padding:9px 18px;border-radius:8px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.outline-btn:hover{border-color:var(--text-muted)}
.form-grid{display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:12px;color:var(--text-muted);font-weight:500}
.field input,.field textarea{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px;font-family:inherit}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--brand)}
.field textarea{min-height:80px;resize:vertical}
.settings-section{margin-top:28px;padding-top:24px;border-top:1px solid var(--line)}
.setting-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--surface-2)}
.setting-info{display:flex;align-items:center;gap:12px}
.setting-info strong{display:block;font-size:13px}
.setting-info span{font-size:11px;color:var(--text-muted)}
.toggle{width:42px;height:24px;border-radius:12px;border:none;background:var(--surface-2);cursor:pointer;position:relative;padding:0}
.toggle.on{background:var(--brand)}
.toggle i{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:.2s}
.toggle.on i{left:21px}
.auth-page{min-height:100vh;background:var(--bg);color:var(--text);display:grid;place-items:center;padding:28px 24px;background-image:linear-gradient(#322f2916 1px,transparent 1px),linear-gradient(90deg,#322f2916 1px,transparent 1px);background-size:48px 48px}
.auth-shell{width:min(100%,980px);max-width:980px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,430px);gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface);box-shadow:0 26px 90px #00000055}
.auth-shell>*{min-width:0;box-sizing:border-box}
.auth-aside{padding:38px;display:flex;flex-direction:column;justify-content:space-between;min-height:510px;background:var(--accent-soft);border-right:1px solid var(--accent-line)}
.auth-logo{color:var(--text);text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.04em}
.auth-logo .brand-mark,.account-brand .brand-mark{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--brand);color:var(--on-accent);font-weight:800;margin-right:8px;vertical-align:-8px}
.auth-logo .brand-avo{color:var(--text)}
.auth-logo .brand-accent{color:var(--brand)}
.auth-aside-copy{max-width:360px}
.auth-aside-copy h1{font-size:38px;line-height:1.06;letter-spacing:-.06em;margin:0 0 16px}
.auth-aside-copy .muted{color:var(--text-faint)}
.auth-benefits{list-style:none;margin:0;padding:18px 0 0;border-top:1px solid var(--accent-line);display:grid;gap:8px;font-size:13px;color:var(--text-muted)}
.auth-benefits li{display:flex;gap:8px;align-items:center}
.auth-benefits li::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--brand);flex:none}
.auth-proof{border-top:1px solid var(--accent-line);padding-top:18px}
.proof-avatars{display:flex;margin-bottom:10px}
.proof-avatars span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text);border:2px solid var(--accent-soft);margin-right:-7px;font:700 8px monospace}
.auth-proof p{font-size:11px;color:var(--text-muted);margin:0}
.auth-proof strong{color:var(--accent-text)}
.auth-card{padding:38px 42px;background:var(--surface);border:0!important;border-radius:0!important;box-shadow:none!important}
.auth-card .back-link{margin-bottom:28px}
.auth-heading{text-align:left;margin-bottom:25px}
.auth-heading h2{font-size:28px;letter-spacing:-.04em;margin:0 0 6px}
.auth-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--accent-text);background:var(--accent-soft);border:1px solid var(--accent-line);margin-bottom:18px}
.auth-error{background:var(--danger-soft);border:1px solid var(--danger-line);border-radius:8px;padding:10px 14px;color:var(--danger);font-size:12px;margin-bottom:14px}
.auth-success{background:var(--accent-soft);border:1px solid #1a5c3a;border-radius:8px;padding:10px 14px;color:var(--accent-text);font-size:12px;margin-bottom:14px}
.auth-field{margin-bottom:16px}
.auth-field label{display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:500}
.auth-field input{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 14px;color:var(--text);font-size:14px;box-sizing:border-box}
.auth-field input:focus{outline:none;border-color:var(--brand)}
.auth-field input::placeholder{color:#484f58}
.auth-submit{width:100%;background:var(--brand);color:var(--bg);border:none;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px}
.auth-submit:hover{background:var(--accent-hover)}
.auth-submit:disabled{opacity:.6;cursor:not-allowed}
.auth-note{margin:14px 0 0;text-align:center;font-size:12px;color:var(--text-muted)}.auth-switch{margin-top:20px;text-align:center;font-size:13px;color:var(--text-muted)}
.auth-switch a{color:var(--brand);text-decoration:none;font-weight:600}
.auth-switch a:hover{text-decoration:underline}
.auth-pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0}
.auth-field{position:relative}
.oauth-stack{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
.oauth-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px;color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:border-color .15s}
.oauth-btn:hover{border-color:var(--text-muted)}
.oauth-divider{display:flex;align-items:center;gap:10px;color:#58636f;font-size:11px;margin:3px 0}
.oauth-divider::before,.oauth-divider::after{content:'';flex:1;height:1px;background:var(--line)}
@media(max-width:768px){.auth-shell{grid-template-columns:1fr}.auth-aside{display:none}.auth-card{padding:28px 24px}}
/* Celular: el menú lateral de 220px dejaba al formulario en ~100px. Pasa a una fila
   con scroll horizontal arriba del contenido y todo lo demás ocupa el ancho. */
@media(max-width:768px){
.account-page{padding:16px}
.account-nav{margin-bottom:18px}
.account-grid{grid-template-columns:minmax(0,1fr);gap:16px}
.account-menu{position:static;flex-direction:row;gap:6px;overflow-x:auto;padding-bottom:6px}
.account-menu-label{display:none}
.account-menu a{flex:none;white-space:nowrap;padding:9px 12px}
.account-menu a.active{box-shadow:inset 0 -2px var(--brand)}
.account-card{padding:18px}
.page-title{font-size:23px}
.profile-hero{flex-direction:column;gap:14px}
.profile-identity{flex-wrap:wrap}
.profile-links{flex-wrap:wrap}
.stat-row{flex-wrap:wrap;gap:10px}
.stat{flex:1 1 90px;min-width:0}
.button-row{flex-wrap:wrap}
.button-row>*{flex:1 1 auto;justify-content:center}
.setting-row{gap:12px}
.field input,.field textarea,.field select{font-size:16px}
.segmented{flex-wrap:wrap}
.segmented button{flex:1 1 40%}
}
`

export function AccountLayout({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <div className="account-page">
      <style>{styles}</style>
      {/* Estas pantallas viven fuera del shell del feed, así que hasta ahora
          nadie verificaba aquí el perfil completo (FR-025). */}
      <ProfileGate />
      <div className="account-wrap">
        <div className="account-nav">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Volver a AvoTalent</Link>
          <div className="account-brand"><img className="brand-mark" src="/avotalent-logo.png" alt="" aria-hidden="true" /> <span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></div>
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

export function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [roleCategory, setRoleCategory] = useState<string | null>(null)
  const [seniority, setSeniority] = useState<string | null>(null)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [location, setLocation] = useState('')
  const [workModality, setWorkModality] = useState<string | null>(null)
  const [tab, setTab] = useState<'profile' | 'cv' | 'preview' | 'notifications'>('profile')
  const { catalog, failed: catalogFailed } = useSkillCatalog()
  const addSkill = (name: string) => setSkills(prev => (prev.includes(name) ? prev : [...prev, name]))
  const { proposals, message: proposalMessage, propose } = useSkillProposals(addSkill)

  useEffect(() => {
    if (!getToken()) { window.location.href = '/login'; return }
    fetchCurrentUser()
      .then(u => {
        if (!u) { window.location.href = '/login'; return }
        setUser(u)
        setDisplayName(u.display_name || '')
        setBio(u.bio || '')
        setWebsite(u.website || '')
        setGithubUrl(u.github_url || '')
        setPhotoUrl(u.photo_url || null)
        setRoleCategory(u.role_category || null)
        setSeniority(u.seniority || null)
        setSkills(u.skills || [])
        setLocation(u.location || '')
        setWorkModality(u.work_modality || null)
        setLoading(false)
      })
      .catch(() => { window.location.href = '/login' })
  }, [])

  async function handleSave() {
    if (!user) return

    // Se valida con el MISMO schema del backend antes de enviar, así el error
    // sale aquí en vez de expulsar a la persona a onboarding después (FR-027).
    if (!photoBase64 && !photoUrl) {
      setError('Tu foto de perfil es obligatoria')
      return
    }
    const validationError = validateCandidateProfile(
      {
        roleCategory,
        seniority,
        skills,
        location: location.trim(),
        workModality,
        displayName,
        bio,
        website,
        githubUrl,
      },
      catalog,
      user.skills || [],
    )
    if (validationError) {
      setError(messageForField(validationError))
      return
    }

    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const token = getToken()
      const res = await fetch(`${API_URL}/api/community/users/${user.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName, bio, website, githubUrl,
          roleCategory, seniority, skills,
          location: location.trim(), workModality,
          ...(photoBase64 ? { photoBase64 } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || data.error || 'Error al guardar'); setSaving(false); return }
      setUser(data.user)
      setPhotoUrl(data.user.photo_url || null)
      setPhotoBase64(null)
      setSaved(true)
      setSaving(false)
      localStorage.setItem('avocado_user', JSON.stringify(data.user))
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Error de conexión')
      setSaving(false)
    }
  }

  if (loading) return (
    <AccountLayout active="settings">
      <section className="account-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand)' }} />
        <p className="muted" style={{ marginTop: 12 }}>Cargando configuración...</p>
      </section>
    </AccountLayout>
  )

  if (!user) return null

  return (
    <AccountLayout active="settings">
      <section className="account-card">
        <p className="page-kicker">Tu espacio</p>
        <h1 className="page-title">Configuración</h1>
        <p className="muted page-description">Controla tu perfil público, arma tu CV y míralo en línea.</p>
        <div className="settings-tabs" role="tablist" aria-label="Secciones de configuración">
          {([['profile', 'Perfil'], ['cv', 'Mi CV'], ['preview', 'Vista previa'], ['notifications', 'Notificaciones']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* El CV se queda montado al cambiar de pestaña, para no perder lo que aún no se guarda. */}
        {tab === 'notifications' && <NotificationPrefs />}

        <div hidden={tab !== 'cv' && tab !== 'preview'}>
          <CvSettings
            view={tab === 'preview' ? 'preview' : 'form'}
            username={user.username}
            initialCv={user.cv}
            initialPublic={!!user.cv_public}
            profile={{
              displayName: displayName || user.username,
              headline: [roleCategory ? ROLE_CATEGORY_LABELS[roleCategory] : '', seniority ? SENIORITY_LABELS[seniority] : ''].filter(Boolean).join(' · '),
              location,
              workModality,
              website,
              githubUrl,
              photoUrl: photoBase64 || photoUrl,
              skills: skills.map(skill => skillLabel(skill, catalog)),
            }}
          />
        </div>

        <div hidden={tab !== 'profile'}>
        {error && <div className="auth-error">{error}</div>}
        {catalogFailed && (
          <div className="auth-error" role="alert">
            No pudimos cargar el catálogo de skills. Puedes guardar tus demás cambios, pero no agregar skills nuevos hasta recargar.
          </div>
        )}
        <h2 className="section-title">Perfil público</h2>
        <div className="form-grid">
          <div className="field"><label>Foto de perfil</label><PhotoPicker photoUrl={photoBase64 || photoUrl} onPick={setPhotoBase64} onError={setError} /></div>
          <div className="field"><label>Nombre visible</label><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" /></div>
          <div className="field"><label>Usuario</label><input value={`@${user.username}`} disabled style={{ opacity: 0.6 }} /></div>
          <div className="field"><label htmlFor="settings-role-category">Puesto</label><RoleCategorySelect id="settings-role-category" options={ROLE_CATEGORY_OPTIONS} value={roleCategory} onChange={setRoleCategory} /></div>
          <div className="field"><label>Nivel</label><SegmentedControl options={SENIORITY_OPTIONS} value={seniority} onChange={setSeniority} /></div>
          <div className="field">
            <label><Tag size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Skills</label>
            <SkillsInput skills={skills} onChange={setSkills} inputValue={skillInput} onInputChange={setSkillInput} onPropose={propose} roleCategory={roleCategory} />
            {proposalMessage && <p className="skill-proposal-message">{proposalMessage}</p>}
            <SkillProposalsList proposals={proposals} onAddSkill={addSkill} />
            <Link href="/examenes" className="skills-validate-link">Validar mis skills con un examen →</Link>
          </div>
          <div className="field"><label><MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Ubicación</label><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ciudad, país" /></div>
          <div className="field"><label>Modalidad deseada</label><SegmentedControl options={MODALITY_OPTIONS} value={workModality} onChange={setWorkModality} /></div>
          <div className="field"><label>Biografía</label><textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Cuéntanos sobre ti..." /></div>
          <div className="field"><label>Sitio web</label><input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://tusitio.com" /></div>
          <div className="field"><label>GitHub</label><input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="github.com/tuusuario" /></div>
        </div>
        <div className="button-row">
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : saved ? <><Check size={14} /> Guardado</> : <><Save size={14} /> Guardar cambios</>}
          </button>
        </div>
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
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (signup && !username.trim()) {
        setError('El username es requerido')
        setLoading(false)
        return
      }

      const endpoint = signup ? '/api/community/auth/signup' : '/api/community/auth/login'
      const body: Record<string, unknown> = { email, password }
      if (signup) {
        body.username = username.trim()
        body.displayName = displayName.trim() || username.trim()
        // De dónde llegó (UTM), para saber qué trae registros.
        const attribution = getAttribution()
        if (attribution) body.attribution = attribution
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
        saveSession(data.session, data.user)
        // Quien venía de una vacante vuelve a ella; el registro pasa primero por el onboarding.
        router.push(signup ? '/onboarding' : (peekReturnTo() ?? '/'))
        router.refresh()
      } else if (signup) {
        setSuccess('Cuenta creada. Revisa tu correo para confirmar tu email y luego inicia sesión.')
        setLoading(false)
      } else {
        setError('No se pudo iniciar sesión. Verifica tu email y contraseña.')
        setLoading(false)
      }
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
          <Link href="/" className="auth-logo"><img className="brand-mark" src="/avotalent-logo.png" alt="" aria-hidden="true" /> <span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></Link>
          <div className="auth-aside-copy">
            <h1>{signup ? 'Encuentra vacantes que sí encajan contigo.' : 'Qué bueno verte de nuevo.'}</h1>
            <p className="muted">{signup ? 'Vacantes de tecnología conectadas a tu puesto y tus skills, y una comunidad para conversar con otros developers.' : 'Vuelve a tus vacantes, tus conversaciones y lo que es para ti.'}</p>
          </div>
          <ul className="auth-benefits">
            <li>Vacantes ordenadas según tu perfil</li>
            <li>Avisos cuando aparece una que encaja</li>
            <li>Una comunidad para preguntar y compartir</li>
          </ul>
        </aside>
        <main className="auth-card">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Volver al foro</Link>
          <div className="auth-heading">
            <h2>{signup ? 'Crea tu cuenta' : 'Inicia sesión'}</h2>
            <p className="muted">{signup ? 'Únete en menos de un minuto.' : 'Continúa donde lo dejaste.'}</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <div className="oauth-stack">
            <button
              type="button"
              className="oauth-btn"
              onClick={() => { window.location.href = `${API_URL}/api/community/auth/oauth/linkedin` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/>
              </svg>
              Continuar con LinkedIn
            </button>
            <button
              type="button"
              className="oauth-btn"
              onClick={() => { window.location.href = `${API_URL}/api/community/auth/oauth/github` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text)" aria-hidden="true">
                <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2 0 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.6 18 4.9 18 4.9c.7 1.7.3 2.9.2 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z"/>
              </svg>
              Continuar con GitHub
            </button>
            <div className="oauth-divider"><span>o regístrate con tu correo</span></div>
          </div>

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

          {signup && <p className="auth-note">Al crear tu cuenta te enviaremos un correo de bienvenida con tus primeros pasos.</p>}

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

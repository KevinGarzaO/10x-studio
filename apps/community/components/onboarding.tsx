'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, MapPin, Tag } from 'lucide-react'
import { getToken, fetchCurrentUser, captureSessionFromUrl } from '../lib/session'
import { SENIORITY_OPTIONS, MODALITY_OPTIONS, ROLE_CATEGORY_OPTIONS } from '../lib/profile-options'
import { PhotoPicker, SegmentedControl, SkillsInput, RoleCategorySelect } from './profile-form-fields'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const styles = `
.onboarding-page{min-height:100vh;background:#0d1117;color:#e6edf3;display:grid;place-items:center;padding:40px 20px;background-image:linear-gradient(#30363d16 1px,transparent 1px),linear-gradient(90deg,#30363d16 1px,transparent 1px);background-size:48px 48px}
.onboarding-card{width:min(100%,560px);background:#161b22;border:1px solid #30363d;border-radius:14px;padding:38px;box-shadow:0 26px 90px #00000055;box-sizing:border-box}
.onboarding-brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:-.04em;font-size:19px;margin-bottom:22px}
.onboarding-brand .brand-mark{color:#00A86B;font-family:monospace}
.onboarding-brand .brand-avo{color:#e6edf3}
.onboarding-brand .brand-accent{color:#00A86B}
.onboarding-kicker{color:#00A86B;font:11px monospace;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px}
.onboarding-card h1{font-size:26px;letter-spacing:-.03em;margin:0 0 8px}
.onboarding-card > p.muted{margin:0 0 26px;color:#8b949e;font-size:13px;line-height:1.6}
.onboarding-card .field{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.onboarding-card .field label{font-size:12px;color:#8b949e;font-weight:500}
.onboarding-card .field input{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#e6edf3;font-size:13px;font-family:inherit;box-sizing:border-box}
.onboarding-card .field input:focus{outline:none;border-color:#00A86B}
.onboarding-card .photo-picker-row{margin-bottom:22px}
.onboarding-error{background:#3d1214;border:1px solid #5c2225;border-radius:8px;padding:10px 14px;color:#f87171;font-size:12px;margin-bottom:16px}
.onboarding-submit{width:100%;background:#00A86B;color:#0d1117;border:none;padding:13px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px}
.onboarding-submit:hover{background:#00c97b}
.onboarding-submit:disabled{opacity:.55;cursor:not-allowed}
`

export function OnboardingPage() {
  const router = useRouter()

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [roleCategory, setRoleCategory] = useState<string | null>(null)
  const [seniority, setSeniority] = useState<string | null>(null)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [location, setLocation] = useState('')
  const [workModality, setWorkModality] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    // A user arriving here straight from the "confirm your email" link has
    // no session in this browser yet — Supabase appended one as a URL hash
    // fragment instead, which captureSessionFromUrl() picks up and saves.
    captureSessionFromUrl()
    fetchCurrentUser().then(user => {
      if (!user) {
        router.replace('/login')
        return
      }
      setCheckingSession(false)
    })
  }, [router])

  const isComplete = !!photoPreview && !!title.trim() && !!roleCategory && !!seniority && skills.length > 0 && !!location.trim() && !!workModality

  async function handleSubmit() {
    if (!isComplete) {
      setError('Completa todos los campos para continuar')
      return
    }
    setSaving(true)
    setError('')
    try {
      const user = await fetchCurrentUser()
      if (!user) {
        router.push('/login')
        return
      }
      const token = getToken()
      const res = await fetch(`${API_URL}/api/community/users/${user.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          roleCategory,
          seniority,
          skills,
          location: location.trim(),
          workModality,
          photoBase64: photoPreview,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al guardar tu perfil')
        setSaving(false)
        return
      }
      localStorage.setItem('avocado_user', JSON.stringify(data.user))
      router.push('/')
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setSaving(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="onboarding-page">
        <style>{styles}</style>
        <div className="onboarding-card" style={{ textAlign: 'center', padding: '60px 38px' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#00A86B' }} />
          <p className="muted" style={{ marginTop: 12 }}>Verificando tu sesión...</p>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      <style>{styles}</style>
      <div className="onboarding-card">
        <div className="onboarding-brand"><span className="brand-mark">&gt;_</span><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></div>
        <p className="onboarding-kicker">Un último paso</p>
        <h1>Completa tu perfil</h1>
        <p className="muted">Esta información nos ayuda a mostrarte vacantes relevantes y a que tu perfil se vea real ante otros miembros de la comunidad.</p>

        {error && <div className="onboarding-error">{error}</div>}

        <PhotoPicker photoUrl={photoPreview} onPick={setPhotoPreview} onError={setError} />

        <div className="field">
          <label htmlFor="onboarding-title">Título profesional</label>
          <input id="onboarding-title" type="text" placeholder="Ej. Backend Developer" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="onboarding-role-category">Categoría de rol</label>
          <RoleCategorySelect id="onboarding-role-category" options={ROLE_CATEGORY_OPTIONS} value={roleCategory} onChange={setRoleCategory} />
        </div>

        <div className="field">
          <label>Nivel</label>
          <SegmentedControl options={SENIORITY_OPTIONS} value={seniority} onChange={setSeniority} />
        </div>

        <div className="field">
          <label htmlFor="onboarding-skills"><Tag size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Skills</label>
          <SkillsInput skills={skills} onChange={setSkills} inputValue={skillInput} onInputChange={setSkillInput} />
        </div>

        <div className="field">
          <label htmlFor="onboarding-location"><MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Ubicación</label>
          <input id="onboarding-location" type="text" placeholder="Ciudad, país" value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div className="field">
          <label>Modalidad deseada</label>
          <SegmentedControl options={MODALITY_OPTIONS} value={workModality} onChange={setWorkModality} />
        </div>

        <button className="onboarding-submit" onClick={handleSubmit} disabled={saving}>
          {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Continuar a AvoTalent'}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

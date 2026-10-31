'use client'

import { trackEvent } from '../lib/web-analytics'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Tag } from 'lucide-react'
import { getToken, getCachedUser, fetchCurrentUser, captureSessionFromUrl } from '../lib/session'
import { SENIORITY_OPTIONS, MODALITY_OPTIONS, ROLE_CATEGORY_OPTIONS } from '../lib/profile-options'
import { PhotoPicker, SegmentedControl, SkillsInput, RoleCategorySelect } from './profile-form-fields'
import { useSkillCatalog } from '../lib/skill-catalog'
import { takeReturnTo } from '../lib/return-to'
import { validateCandidateProfile, messageForField } from '../lib/profile-validation'
import { useSkillProposals } from '../lib/skill-proposals'
import { SkillProposalsList } from './skill-proposals-list'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const styles = `
.onboarding-page{min-height:100vh;background:var(--bg);color:var(--text);display:grid;place-items:center;padding:40px 20px;}
.onboarding-card{width:min(100%,560px);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:38px;box-shadow:0 8px 30px rgba(15,23,42,.08);box-sizing:border-box}
.onboarding-brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:-.04em;font-size:19px;margin-bottom:22px}
.onboarding-brand .brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--brand);color:var(--on-accent);font-weight:800}
.onboarding-brand .brand-avo{color:var(--text)}
.onboarding-brand .brand-accent{color:var(--brand)}

.onboarding-card h1{font-size:26px;letter-spacing:-.02em;margin:0 0 8px}
.onboarding-card > p.muted{margin:0 0 26px;color:var(--text-muted);font-size:13px;line-height:1.6}
.onboarding-card .field{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.onboarding-card .field label{font-size:12px;color:var(--text-muted);font-weight:500}
.onboarding-card .field input{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px;font-family:inherit;box-sizing:border-box}
.onboarding-card .field input:focus{outline:none;border-color:var(--brand)}
.onboarding-card .photo-picker-row{margin-bottom:22px}
.onboarding-error{background:var(--danger-soft);border:1px solid var(--danger-line);border-radius:8px;padding:10px 14px;color:var(--danger);font-size:12px;margin-bottom:16px}
.onboarding-submit{width:100%;background:var(--brand);color:var(--bg);border:none;padding:13px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px}
.onboarding-submit:hover{background:var(--accent-hover)}
.onboarding-submit:disabled{opacity:.55;cursor:not-allowed}
.onboarding-progress{display:flex;gap:6px;margin:4px 0 10px}
.onboarding-progress i{flex:1;height:5px;border-radius:999px;background:var(--line);transition:background .2s}
.onboarding-progress i.on{background:var(--brand)}
.onboarding-step-label{color:var(--text-muted);font:600 13px var(--font-sans);margin:0 0 20px}
.onboarding-avatar-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.onboarding-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--accent-line)}
.onboarding-avatar-row span{color:var(--accent-text);font:500 13px var(--font-sans)}
.onboarding-nav{display:flex;gap:10px;margin-top:6px}
.onboarding-nav .back{background:transparent;color:var(--text-muted);border:1px solid var(--line);padding:13px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit}
.onboarding-nav .back:hover{border-color:var(--text-muted)}
@media(max-width:600px){
.onboarding-page{padding:16px}
.onboarding-card{padding:22px 18px}
.onboarding-card h1{font-size:22px}
.onboarding-card .field input{font-size:16px}
.segmented{flex-wrap:wrap}
.segmented button{flex:1 1 40%}
}
`

export function OnboardingPage() {
  const router = useRouter()

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [roleCategory, setRoleCategory] = useState<string | null>(null)
  const [seniority, setSeniority] = useState<string | null>(null)
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [location, setLocation] = useState('')
  const [workModality, setWorkModality] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionFailed, setSessionFailed] = useState(false)
  const [step, setStep] = useState(0)
  // true cuando la cuenta ya traía foto al entrar (subida antes o tomada de la
  // red social): entonces el paso de foto no existe y el flujo tiene solo 2 pasos.
  const [photoPrefilled, setPhotoPrefilled] = useState(false)
  const { catalog, failed: catalogFailed } = useSkillCatalog()
  const addSkill = (name: string) => setSkills(prev => (prev.includes(name) ? prev : [...prev, name]))
  const { proposals, message: proposalMessage, propose } = useSkillProposals(addSkill)
  // La precarga corre UNA sola vez aunque el efecto se vuelva a disparar (el
  // router cambia de identidad en algunos entornos): si no, cada re-render
  // devolvería el asistente al primer paso y navegar se volvería imposible.
  const didPreload = useRef(false)

  useEffect(() => {
    if (didPreload.current) return
    didPreload.current = true
    // A user arriving here straight from the "confirm your email" link has
    // no session in this browser yet — Supabase appended one as a URL hash
    // fragment instead, which captureSessionFromUrl() picks up and saves.
    captureSessionFromUrl()

    // Se precarga TODO lo que la cuenta ya tenga, no solo la foto (FR-026):
    // a quien vuelve aquí por un campo nuevo no se le vuelve a pedir lo que
    // ya había capturado. Solo se llenan campos vacíos: lo que la persona ya
    // escribió mientras llegaba la respuesta del servidor no se pisa.
    const preload = (user: any) => {
      if (user.photo_url) {
        setPhotoPreview(prev => prev || user.photo_url)
        // Ese paso ya está: se empieza en el puesto (quien vino de GitHub/LinkedIn
        // llega aquí con su avatar y ni ve el paso de foto).
        setPhotoPrefilled(true)
        setStep(current => (current === 0 ? 1 : current))
      }
      if (user.role_category) setRoleCategory(prev => prev || user.role_category)
      if (user.seniority) setSeniority(prev => prev || user.seniority)
      if (Array.isArray(user.skills)) setSkills(prev => (prev.length ? prev : user.skills))
      if (user.location) setLocation(prev => prev || user.location)
      if (user.work_modality) setWorkModality(prev => prev || user.work_modality)
    }

    // La pantalla no espera a la red: si ya hay un usuario guardado en este
    // navegador se muestra el formulario al instante y el servidor confirma
    // después. Con mala conexión antes se quedaba un "Verificando..." sin fin.
    const cached = getToken() ? getCachedUser() : null
    if (cached?.username) {
      preload(cached)
      setCheckingSession(false)
    }

    fetchCurrentUser().then(user => {
      if (!user) {
        router.replace('/login')
        return
      }
      preload(user)
      setCheckingSession(false)
    }).catch(() => {
      // Sin respuesta del servidor: si ya hay formulario se deja trabajar; si no, se ofrece reintentar.
      if (!cached?.username) setSessionFailed(true)
    })
  }, [router])

  // La foto es obligatoria para toda cuenta (FR-024); el resto lo valida el
  // schema compartido, el mismo que usa el backend.
  const payload = {
    roleCategory,
    seniority,
    skills,
    location: location.trim(),
    workModality,
  }
  const validationError = validateCandidateProfile(payload, catalog)

  // Validación por paso: quien falle ve el problema en el paso donde está, no
  // al final de un formulario largo. El envío final sigue validando TODO con el
  // schema real del backend.
  function stepError(n: number): string {
    if (n === 0) {
      if (!photoPreview) return 'Tu foto de perfil es obligatoria'
    }
    if (n === 1) {
      if (!roleCategory) return 'Elige tu categoría de rol'
      if (!seniority) return 'Elige tu nivel'
      if (!workModality) return 'Elige tu modalidad'
    }
    if (n === 2) {
      if (skills.length === 0) return 'Elige al menos un skill del catálogo'
      if (!location.trim()) return 'Tu ubicación es obligatoria'
    }
    return ''
  }

  function nextStep() {
    const msg = stepError(step)
    if (msg) { setError(msg); return }
    setError('')
    setStep(s => Math.min(s + 1, 2))
  }

  function prevStep() {
    setError('')
    setStep(s => Math.max(s - 1, photoPrefilled ? 1 : 0))
  }

  async function handleSubmit() {
    if (!photoPreview) {
      setError('Tu foto de perfil es obligatoria')
      return
    }
    if (validationError) {
      setError(messageForField(validationError))
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
          ...payload,
          // photoPreview may now hold either a freshly picked image (a
          // data: URL) or the user's pre-existing photo_url (preloaded
          // above) — only the former is something the backend can upload;
          // sending the existing URL back as "photoBase64" would corrupt it.
          photoBase64: photoPreview?.startsWith('data:') ? photoPreview : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || data.error || 'Error al guardar tu perfil')
        setSaving(false)
        return
      }
      localStorage.setItem('avocado_user', JSON.stringify(data.user))
      void trackEvent('profile_completed', { role: roleCategory ?? undefined, seniority: seniority ?? undefined })
      // Termina el recorrido: si venía de una vacante, vuelve a ella.
      router.push(takeReturnTo() ?? '/')
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
          {sessionFailed ? (
            <>
              <p className="muted">No pudimos conectar. Revisa tu internet e intenta de nuevo.</p>
              <button type="button" className="onboarding-submit" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>Reintentar</button>
            </>
          ) : (
            <>
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand)' }} />
              <p className="muted" style={{ marginTop: 12 }}>Verificando tu sesión...</p>
            </>
          )}
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const brand = (
    <div className="onboarding-brand"><img className="brand-mark" src="/avotalent-logo.png" alt="" aria-hidden="true" /><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></div>
  )

  // Con la foto ya presente (la subió antes o vino de la red social) el
  // formulario arranca en el paso de puesto y solo tiene 2 pasos.
  const firstStep = photoPrefilled ? 1 : 0
  const stepCount = 3 - firstStep

  return (
    <div className="onboarding-page">
      <style>{styles}</style>
      <div className="onboarding-card">
        {brand}
        <h1>Completa tu perfil</h1>
        <p className="muted">Esta información nos ayuda a mostrarte vacantes relevantes y a que tu perfil se vea real ante otros miembros de la comunidad.</p>

        {error && <div className="onboarding-error">{error}</div>}

        <div className="onboarding-progress" aria-hidden="true">
          {Array.from({ length: stepCount }, (_, i) => (
            <i key={i} className={step >= firstStep + i ? 'on' : ''} />
          ))}
        </div>
        <p className="onboarding-step-label">Paso {step - firstStep + 1} de {stepCount}</p>

        {photoPrefilled && photoPreview && step !== 0 && (
          <div className="onboarding-avatar-row">
            <img className="onboarding-avatar" src={photoPreview} alt="Tu foto de perfil" />
            <span>Foto lista, no hace falta volver a subirla</span>
          </div>
        )}

        {step === 0 && (
          <PhotoPicker photoUrl={photoPreview} onPick={setPhotoPreview} onError={setError} />
        )}

        {step === 1 && (
          <>
            <div className="field">
              <label htmlFor="onboarding-role-category">Puesto</label>
              <RoleCategorySelect id="onboarding-role-category" options={ROLE_CATEGORY_OPTIONS} value={roleCategory} onChange={setRoleCategory} />
            </div>
            <div className="field">
              <label>Nivel</label>
              <SegmentedControl options={SENIORITY_OPTIONS} value={seniority} onChange={setSeniority} />
            </div>
            <div className="field">
              <label>Modalidad deseada</label>
              <SegmentedControl options={MODALITY_OPTIONS} value={workModality} onChange={setWorkModality} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label htmlFor="onboarding-skills"><Tag size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Skills</label>
              <SkillsInput skills={skills} onChange={setSkills} inputValue={skillInput} onInputChange={setSkillInput} onPropose={propose} roleCategory={roleCategory} />
              {proposalMessage && <p className="skill-proposal-message">{proposalMessage}</p>}
              <SkillProposalsList proposals={proposals} onAddSkill={addSkill} />
            </div>
            <div className="field">
              <label htmlFor="onboarding-location"><MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Ubicación</label>
              <input id="onboarding-location" type="text" placeholder="Ciudad, país" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
          </>
        )}

        {catalogFailed && (
          <div className="onboarding-error" role="alert">
            No pudimos cargar el catálogo de skills. Recarga la página para continuar.
          </div>
        )}

        {step < 2 ? (
          <div className="onboarding-nav">
            {step > firstStep && (
              <button className="back" onClick={prevStep}>Atrás</button>
            )}
            <button className="onboarding-submit" style={{ flex: 1, marginTop: 0 }} onClick={nextStep}>
              Siguiente
            </button>
          </div>
        ) : (
          <>
            <button className="onboarding-submit" onClick={handleSubmit} disabled={saving || catalogFailed}>
              {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Continuar a AvoTalent'}
            </button>
            <p className="muted" style={{ marginTop: 10, fontSize: 12, textAlign: 'center' }}>Te enviaremos un correo de bienvenida con tus primeros pasos.</p>
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

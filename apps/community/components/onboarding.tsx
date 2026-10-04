'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, MapPin, Tag } from 'lucide-react'
import { getToken, fetchCurrentUser, captureSessionFromUrl } from '../lib/session'
import { SENIORITY_OPTIONS, MODALITY_OPTIONS, ROLE_CATEGORY_OPTIONS } from '../lib/profile-options'
import { PhotoPicker, SegmentedControl, SkillsInput, RoleCategorySelect } from './profile-form-fields'
import { useSkillCatalog } from '../lib/skill-catalog'
import { validateCandidateProfile, messageForField } from '../lib/profile-validation'
import { useSkillProposals } from '../lib/skill-proposals'
import { useMyCompanyClaim, SIGNUP_INTENT_KEY } from '../lib/company-claim'
import { CompanyClaimForm } from './company-claim-form'
import { SkillProposalsList } from './skill-proposals-list'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const styles = `
.onboarding-page{min-height:100vh;background:#18161a;color:#f3efe9;display:grid;place-items:center;padding:40px 20px;background-image:linear-gradient(#322f2916 1px,transparent 1px),linear-gradient(90deg,#322f2916 1px,transparent 1px);background-size:48px 48px}
.onboarding-card{width:min(100%,560px);background:#221f1b;border:1px solid #322f29;border-radius:14px;padding:38px;box-shadow:0 26px 90px #00000055;box-sizing:border-box}
.onboarding-brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:-.04em;font-size:19px;margin-bottom:22px}
.onboarding-brand .brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#00A86B;color:#0d1f16;font-weight:800}
.onboarding-brand .brand-avo{color:#f3efe9}
.onboarding-brand .brand-accent{color:#00A86B}
.onboarding-kicker{color:#00A86B;font:11px monospace;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px}
.onboarding-card h1{font-size:26px;letter-spacing:-.03em;margin:0 0 8px}
.onboarding-card > p.muted{margin:0 0 26px;color:#b3aba1;font-size:13px;line-height:1.6}
.onboarding-card .field{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.onboarding-card .field label{font-size:12px;color:#b3aba1;font-weight:500}
.onboarding-card .field input{background:#18161a;border:1px solid #322f29;border-radius:8px;padding:10px 14px;color:#f3efe9;font-size:13px;font-family:inherit;box-sizing:border-box}
.onboarding-card .field input:focus{outline:none;border-color:#00A86B}
.onboarding-card .photo-picker-row{margin-bottom:22px}
.onboarding-error{background:#3d1214;border:1px solid #5c2225;border-radius:8px;padding:10px 14px;color:#f87171;font-size:12px;margin-bottom:16px}
.onboarding-submit{width:100%;background:#00A86B;color:#18161a;border:none;padding:13px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px}
.onboarding-submit:hover{background:#00c97b}
.onboarding-submit:disabled{opacity:.55;cursor:not-allowed}
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
  const { catalog, failed: catalogFailed } = useSkillCatalog()
  const addSkill = (name: string) => setSkills(prev => (prev.includes(name) ? prev : [...prev, name]))
  const { proposals, message: proposalMessage, propose } = useSkillProposals(addSkill)
  const { claim, loading: loadingClaim, reload: reloadClaim } = useMyCompanyClaim()
  // Candidato o empresa. Quien eligió "empresa" al registrarse llega con la
  // intención guardada; el resto elige aquí.
  const [accountKind, setAccountKind] = useState<'candidate' | 'company' | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const intent = localStorage.getItem(SIGNUP_INTENT_KEY)
    if (intent === 'company' || intent === 'candidate') setAccountKind(intent)
  }, [])

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
      // Se precarga TODO lo que la cuenta ya tenga, no solo la foto (FR-026):
      // a quien vuelve aquí por un campo nuevo no se le vuelve a pedir lo que
      // ya había capturado.
      if (user.photo_url) setPhotoPreview(user.photo_url)
      if (user.title) setTitle(user.title)
      if (user.role_category) setRoleCategory(user.role_category)
      if (user.seniority) setSeniority(user.seniority)
      if (Array.isArray(user.skills)) setSkills(user.skills)
      if (user.location) setLocation(user.location)
      if (user.work_modality) setWorkModality(user.work_modality)
      // A quien ya capturó perfil de candidato no se le pregunta de nuevo si
      // es empresa: su respuesta ya está en la cuenta.
      if (user.title || (Array.isArray(user.skills) && user.skills.length > 0)) {
        setAccountKind(prev => prev ?? 'candidate')
      }
      setCheckingSession(false)
    })
  }, [router])

  // La foto es obligatoria para toda cuenta (FR-024); el resto lo valida el
  // schema compartido, el mismo que usa el backend.
  const payload = {
    title: title.trim(),
    roleCategory,
    seniority,
    skills,
    location: location.trim(),
    workModality,
  }
  const validationError = validateCandidateProfile(payload, catalog)

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

  const brand = (
    <div className="onboarding-brand"><span className="brand-mark" aria-hidden="true">A</span><span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span></div>
  )

  // Quien ya mandó una solicitud, o eligió empresa, sigue por ese camino: a una
  // empresa no se le piden skills ni modalidad de trabajo.
  const showsCompanyFlow = accountKind === 'company' || (!!claim && claim.status !== 'approved')

  if (!loadingClaim && showsCompanyFlow) {
    return (
      <div className="onboarding-page">
        <style>{styles}</style>
        <div className="onboarding-card">
          {brand}
          <p className="onboarding-kicker">Registro de empresa</p>
          <h1>Verifica tu empresa</h1>
          <p className="muted">
            Necesitamos comprobar que la empresa existe y que tú puedes representarla. Una persona
            revisa los documentos y te avisamos aquí mismo.
          </p>
          <CompanyClaimForm claim={claim} onSubmitted={reloadClaim} />
          {!claim && (
            <button className="text-button onboarding-switch" onClick={() => setAccountKind('candidate')}>
              En realidad busco trabajo
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!loadingClaim && accountKind === null) {
    return (
      <div className="onboarding-page">
        <style>{styles}</style>
        <div className="onboarding-card">
          {brand}
          <p className="onboarding-kicker">Un último paso</p>
          <h1>¿Cómo vas a usar AvoTalent?</h1>
          <p className="muted">Puedes cambiarlo después solo con ayuda del equipo, así que elige con calma.</p>
          <div className="onboarding-kind">
            <button onClick={() => setAccountKind('candidate')}>
              <strong>Busco trabajo</strong>
              <small>Arma tu perfil, valida tus skills y recibe vacantes que te queden.</small>
            </button>
            <button onClick={() => setAccountKind('company')}>
              <strong>Represento a una empresa</strong>
              <small>Reclama el perfil de tu empresa y publica tus vacantes.</small>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      <style>{styles}</style>
      <div className="onboarding-card">
        {brand}
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
          <SkillsInput skills={skills} onChange={setSkills} inputValue={skillInput} onInputChange={setSkillInput} onPropose={propose} roleCategory={roleCategory} />
          {proposalMessage && <p className="skill-proposal-message">{proposalMessage}</p>}
          <SkillProposalsList proposals={proposals} onAddSkill={addSkill} />
        </div>

        <div className="field">
          <label htmlFor="onboarding-location"><MapPin size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Ubicación</label>
          <input id="onboarding-location" type="text" placeholder="Ciudad, país" value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div className="field">
          <label>Modalidad deseada</label>
          <SegmentedControl options={MODALITY_OPTIONS} value={workModality} onChange={setWorkModality} />
        </div>

        {catalogFailed && (
          <div className="onboarding-error" role="alert">
            No pudimos cargar el catálogo de skills. Recarga la página para continuar.
          </div>
        )}

        <button className="onboarding-submit" onClick={handleSubmit} disabled={saving || catalogFailed}>
          {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Continuar a AvoTalent'}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

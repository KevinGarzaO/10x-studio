'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Check, Printer, Save } from 'lucide-react'
import { parseStoredCv, type Cv } from '@avocado/schemas'
import { getToken } from '../../lib/session'
import { validateCv } from '../../lib/cv'
import { CvForm } from './CvForm'
import { CvPreview, type CvPreviewProfile } from './CvPreview'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface CvSettingsProps {
  /** Qué se muestra: el formulario o la vista previa. */
  view: 'form' | 'preview'
  username: string
  /** users.cv tal como llegó del servidor (puede venir vacío o viejo). */
  initialCv: unknown
  initialPublic: boolean
  /** Lo del perfil, tal como está AHORA en el formulario de perfil (aunque no se haya guardado). */
  profile: CvPreviewProfile
}

/**
 * La parte de CV de /settings: el formulario por secciones y la vista previa en
 * línea. Guarda aparte del perfil, porque un CV se llena de a poco y no debe
 * exigir los campos obligatorios del perfil en cada guardado.
 */
export function CvSettings({ view, username, initialCv, initialPublic, profile }: CvSettingsProps) {
  const [cv, setCv] = useState<Cv>(() => parseStoredCv(initialCv))
  const [isPublic, setIsPublic] = useState(initialPublic)
  // Lo último que el servidor confirmó: sirve para saber si hay cambios sin guardar.
  const [saved, setSaved] = useState(() => JSON.stringify({ cv: parseStoredCv(initialCv), isPublic: initialPublic }))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState('')

  const dirty = useMemo(() => JSON.stringify({ cv, isPublic }) !== saved, [cv, isPublic, saved])

  async function save() {
    const problem = validateCv(cv)
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError('')
    setJustSaved(false)
    try {
      const res = await fetch(`${API_URL}/api/community/users/${username}/cv`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ cv, public: isPublic }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'No pudimos guardar tu CV')
        return
      }
      // Se queda lo que el servidor guardó (ya sin espacios sobrantes).
      const stored = parseStoredCv(data.cv)
      setCv(stored)
      setIsPublic(!!data.isPublic)
      setSaved(JSON.stringify({ cv: stored, isPublic: !!data.isPublic }))
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    } catch {
      setError('Error de conexión. Intenta de nuevo')
    } finally {
      setSaving(false)
    }
  }

  const onlineHref = `/cv/${username}`

  if (view === 'preview') {
    return (
      <div className="cv-preview-wrap">
        <div className="cv-toolbar">
          <p className="muted">
            Así se ve tu CV.{dirty && ' Incluye cambios que aún no guardas.'}
          </p>
          <div className="cv-toolbar-actions">
            <button type="button" className="outline-btn" onClick={() => window.print()}>
              <Printer size={14} /> Imprimir o guardar PDF
            </button>
            {isPublic && !dirty && (
              <Link href={onlineHref} className="outline-btn" target="_blank">
                <ExternalLink size={14} /> Abrir CV en línea
              </Link>
            )}
          </div>
        </div>
        <CvPreview
          profile={profile}
          cv={cv}
          emptyHint="Tu CV está vacío todavía. Llena las secciones de la pestaña “Mi CV” y aparecerán aquí."
        />
      </div>
    )
  }

  return (
    <div>
      <p className="muted page-description">
        Llena lo que quieras: es opcional y puedes volver cuando quieras. Tu puesto, nivel, skills y ubicación vienen de tu perfil.
      </p>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <CvForm value={cv} onChange={setCv} />

      <section className="cv-form-section" aria-label="Privacidad">
        <div className="cv-form-section-head">
          <h3>Tu CV en línea</h3>
          <p className="muted">
            Si lo haces público, cualquiera con el enlace puede verlo sin iniciar sesión. Mientras esté privado, solo lo ves tú.
          </p>
        </div>
        <label className="cv-check cv-public-toggle">
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
          <span>Hacer público mi CV</span>
        </label>
        {isPublic && !dirty && (
          <p className="cv-share">
            Tu enlace: <Link href={onlineHref} target="_blank">{`/cv/${username}`}</Link>
          </p>
        )}
        {isPublic && dirty && <p className="muted cv-share">Guarda los cambios para activar el enlace.</p>}
      </section>

      <div className="button-row">
        <button type="button" className="primary-btn" onClick={save} disabled={saving || !dirty}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : justSaved ? <><Check size={14} /> CV guardado</> : <><Save size={14} /> Guardar CV</>}
        </button>
        {dirty && !saving && <span className="muted cv-dirty">Tienes cambios sin guardar</span>}
      </div>
    </div>
  )
}

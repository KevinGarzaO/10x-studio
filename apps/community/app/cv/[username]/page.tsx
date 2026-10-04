'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Lock, Printer } from 'lucide-react'
import { parseStoredCv, type Cv } from '@avocado/schemas'
import { getToken } from '../../../lib/session'
import { useSkillCatalog, skillLabel } from '../../../lib/skill-catalog'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../../lib/profile-options'
import { CvPreview } from '../../../components/cv/CvPreview'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface CvResponse {
  profile: {
    username: string
    display_name?: string | null
    photo_url?: string | null
    title?: string | null
    role_category?: string | null
    seniority?: string | null
    location?: string | null
    work_modality?: string | null
    skills?: string[] | null
    website?: string | null
    github_url?: string | null
  }
  cv: Cv
  isPublic: boolean
  isOwner: boolean
}

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: CvResponse }

/**
 * El CV en línea de una persona. Es público solo si su dueño lo publicó; un CV
 * privado responde igual que uno que no existe. El dueño lo ve siempre, con un
 * aviso de que solo él puede.
 */
export default function PublicCvPage() {
  const { username } = useParams<{ username: string }>()
  const { catalog } = useSkillCatalog()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const token = getToken()

    fetch(`${API_URL}/api/community/users/${username}/cv`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then(async res => {
        if (cancelled) return
        if (res.status === 404) return setState({ status: 'missing' })
        if (!res.ok) return setState({ status: 'error' })
        const data = await res.json()
        setState({ status: 'ready', data: { ...data, cv: parseStoredCv(data.cv) } })
      })
      .catch(() => !cancelled && setState({ status: 'error' }))

    return () => { cancelled = true }
  }, [username])

  return (
    <div className="cv-page">
      <header className="cv-page-bar">
        <Link href="/" className="back-link"><ArrowLeft size={15} /> Volver a AvoTalent</Link>
        <div className="account-brand"><span className="brand-mark" aria-hidden="true">A</span> <span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></div>
      </header>

      {state.status === 'loading' && <p className="muted cv-page-note">Cargando CV...</p>}

      {state.status === 'error' && <p className="muted cv-page-note" role="alert">No pudimos cargar este CV. Intenta de nuevo en un momento.</p>}

      {state.status === 'missing' && (
        <div className="cv-page-note" role="status">
          <h1>Este CV no está disponible</h1>
          <p className="muted">Puede que no exista o que su dueño no lo haya hecho público.</p>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="cv-toolbar">
            {state.data.isOwner && !state.data.isPublic ? (
              <p className="cv-private-note" role="status">
                <Lock size={14} /> Solo tú ves este CV. Hazlo público desde <Link href="/settings">Configuración</Link> para compartirlo.
              </p>
            ) : <span />}
            <button type="button" className="outline-btn" onClick={() => window.print()}>
              <Printer size={14} /> Imprimir o guardar PDF
            </button>
          </div>
          <CvPreview
            cv={state.data.cv}
            profile={{
              displayName: state.data.profile.display_name || state.data.profile.username,
              headline: [
                state.data.profile.role_category ? ROLE_CATEGORY_LABELS[state.data.profile.role_category] : state.data.profile.title || '',
                state.data.profile.seniority ? SENIORITY_LABELS[state.data.profile.seniority] : '',
              ].filter(Boolean).join(' · '),
              location: state.data.profile.location,
              workModality: state.data.profile.work_modality,
              website: state.data.profile.website,
              githubUrl: state.data.profile.github_url,
              photoUrl: state.data.profile.photo_url,
              skills: (state.data.profile.skills || []).map(skill => skillLabel(skill, catalog)),
            }}
          />
        </>
      )}
    </div>
  )
}

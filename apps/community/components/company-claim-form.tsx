'use client'

import { useEffect, useState } from 'react'
import { Building, Check, Clock3, FileText, Loader2, X } from 'lucide-react'
import { COMPANY_SIZES, RFC_PATTERN, type ClaimDocumentKind } from '@avocado/schemas'
import {
  searchClaimableCompanies,
  submitCompanyClaim,
  readFileAsDataUrl,
  type ClaimableCompany,
  type CompanyClaim,
} from '../lib/company-claim'

const DOCUMENTS: { kind: ClaimDocumentKind; label: string; help: string; required: boolean }[] = [
  {
    kind: 'existence',
    label: 'Acta constitutiva o Constancia de Situación Fiscal',
    help: 'Prueba que la empresa existe y su RFC está vigente.',
    required: true,
  },
  {
    kind: 'identity',
    label: 'Tu identificación oficial',
    help: 'INE o pasaporte vigente de quien hace la solicitud.',
    required: true,
  },
  {
    kind: 'representation',
    label: 'Poder notarial o carta poder',
    help: 'Solo si no eres el representante legal que aparece en el acta.',
    required: false,
  },
]

type Files = Partial<Record<ClaimDocumentKind, File>>

/**
 * Alta de empresa: reclamar la que el scraper ya publica, o registrar una
 * nueva, con los documentos que el superadmin va a revisar.
 *
 * Mientras la solicitud está en revisión la cuenta sigue siendo de candidato:
 * nadie actúa en nombre de una empresa sin aprobación (requerimiento 003, C.4).
 */
export function CompanyClaimForm({ claim, onSubmitted }: { claim: CompanyClaim | null; onSubmitted: () => void }) {
  const [companyName, setCompanyName] = useState('')
  const [matches, setMatches] = useState<ClaimableCompany[]>([])
  const [picked, setPicked] = useState<ClaimableCompany | null>(null)
  const [rfc, setRfc] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [files, setFiles] = useState<Files>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Buscar la empresa mientras se escribe, para no crear un duplicado de una
  // que el scraper ya publica.
  useEffect(() => {
    if (picked || companyName.trim().length < 2) {
      setMatches([])
      return
    }
    const timer = setTimeout(() => {
      searchClaimableCompanies(companyName).then(setMatches)
    }, 300)
    return () => clearTimeout(timer)
  }, [companyName, picked])

  if (claim && claim.status === 'pending') {
    return (
      <div className="claim-status is-pending">
        <Clock3 size={20} />
        <div>
          <strong>Tu solicitud está en revisión</strong>
          <p>
            Estamos verificando los documentos de <b>{claim.companyName}</b>. Mientras tanto tu
            cuenta sigue siendo personal: todavía no puedes publicar vacantes ni actuar en nombre
            de la empresa.
          </p>
          <p className="claim-status-docs">
            {claim.documents.length} documento{claim.documents.length === 1 ? '' : 's'} entregado
            {claim.documents.length === 1 ? '' : 's'}.
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit() {
    setError('')

    const normalizedRfc = rfc.trim().toUpperCase()
    if (!RFC_PATTERN.test(normalizedRfc)) {
      setError('El RFC no tiene un formato válido')
      return
    }
    for (const doc of DOCUMENTS.filter(d => d.required)) {
      if (!files[doc.kind]) {
        setError(`Falta un documento: ${doc.label}`)
        return
      }
    }

    setSaving(true)
    try {
      const documents = await Promise.all(
        (Object.keys(files) as ClaimDocumentKind[]).map(async kind => ({
          kind,
          fileName: files[kind]!.name,
          dataUrl: await readFileAsDataUrl(files[kind]!),
        })),
      )

      const result = await submitCompanyClaim({
        companyName: companyName.trim(),
        rfc: normalizedRfc,
        companyUserId: picked?.id ?? null,
        website: website.trim() || null,
        description: description.trim() || null,
        companySize: companySize || null,
        industry: industry.trim() || null,
        location: location.trim() || null,
        documents,
      })

      if (!result.ok) {
        setError(result.message)
        setSaving(false)
        return
      }
      onSubmitted()
    } catch {
      setError('No pudimos leer uno de los archivos')
      setSaving(false)
    }
  }

  return (
    <div className="claim-form">
      {claim?.status === 'rejected' && (
        <div className="claim-status is-rejected">
          <X size={18} />
          <div>
            <strong>Tu solicitud anterior no fue aprobada</strong>
            <p>{claim.rejectionReason}</p>
            <p className="claim-status-docs">Puedes corregir y volver a enviarla.</p>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="claim-company">Nombre de la empresa</label>
        <input
          id="claim-company"
          value={companyName}
          onChange={e => {
            setCompanyName(e.target.value)
            setPicked(null)
          }}
          placeholder="Ej. Stripe"
          autoComplete="off"
        />
        {picked && (
          <p className="claim-picked">
            <Check size={13} /> Reclamarás el perfil que ya existe de <b>{picked.name}</b>
            <button type="button" onClick={() => setPicked(null)}>cambiar</button>
          </p>
        )}
        {!picked && matches.length > 0 && (
          <div className="claim-matches">
            <p>Estas empresas ya están en AvoTalent. ¿Es la tuya?</p>
            {matches.map(match => (
              <button
                key={match.id}
                type="button"
                onClick={() => {
                  setPicked(match)
                  setCompanyName(match.name)
                  setMatches([])
                }}
              >
                <Building size={14} /> {match.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="claim-rfc">RFC</label>
        <input
          id="claim-rfc"
          value={rfc}
          onChange={e => setRfc(e.target.value.toUpperCase())}
          placeholder="Ej. ABC010203XY1"
          maxLength={13}
        />
      </div>

      <div className="field">
        <label htmlFor="claim-website">Sitio web</label>
        <input id="claim-website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
      </div>

      <div className="field">
        <label htmlFor="claim-size">Tamaño</label>
        <select id="claim-size" className="role-category-select" value={companySize} onChange={e => setCompanySize(e.target.value)}>
          <option value="">Selecciona un tamaño</option>
          {COMPANY_SIZES.map(size => <option key={size} value={size}>{size} personas</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="claim-industry">Industria</label>
        <input id="claim-industry" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Ej. Fintech" />
      </div>

      <div className="field">
        <label htmlFor="claim-location">Ubicación</label>
        <input id="claim-location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ciudad, país" />
      </div>

      <div className="field">
        <label htmlFor="claim-description">Descripción</label>
        <textarea id="claim-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="A qué se dedica la empresa" />
      </div>

      <div className="claim-documents">
        <p className="claim-documents-title">Documentos para verificar la empresa</p>
        <p className="claim-documents-note">
          Solo los ve quien revisa tu solicitud, y <b>se eliminan en cuanto se decide</b>. PDF o
          imagen, máximo 8 MB cada uno.
        </p>
        {DOCUMENTS.map(doc => (
          <label key={doc.kind} className="claim-document">
            <FileText size={16} />
            <span>
              <strong>{doc.label}{doc.required ? '' : ' (opcional)'}</strong>
              <small>{doc.help}</small>
              {files[doc.kind] && <em>{files[doc.kind]!.name}</em>}
            </span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              aria-label={doc.label}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) setFiles(prev => ({ ...prev, [doc.kind]: file }))
              }}
            />
          </label>
        ))}
      </div>

      {error && <div className="onboarding-error" role="alert">{error}</div>}

      <button className="onboarding-submit" onClick={handleSubmit} disabled={saving}>
        {saving ? <><Loader2 size={16} className="spin" /> Enviando...</> : 'Enviar solicitud'}
      </button>
    </div>
  )
}

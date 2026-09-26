'use client'

import { useRef, useState, KeyboardEvent } from 'react'
import { Sparkles, UploadCloud, X } from 'lucide-react'
import { resolveSkill } from '@avocado/schemas'
import { useSkillCatalog, skillLabel, unresolvedSkills } from '../lib/skill-catalog'

// Shared building blocks for both the onboarding form and the settings
// "edit profile" form, so the two never drift apart visually or behaviorally.

export function SegmentedControl({ options, value, onChange }: { options: { value: string; label: string }[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="segmented">
      {options.map(opt => (
        <button key={opt.value} type="button" className={value === opt.value ? 'active' : ''} onClick={() => onChange(opt.value)}>{opt.label}</button>
      ))}
    </div>
  )
}

// Plain <select> instead of a segmented control — role_category has 13
// options, too many for the button-row style used for seniority/modality.
export function RoleCategorySelect({ options, value, onChange, id }: { options: { value: string; label: string }[]; value: string | null; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} className="role-category-select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Selecciona una categoría</option>
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  )
}

export interface SkillsInputProps {
  skills: string[]
  onChange: (skills: string[]) => void
  inputValue: string
  onInputChange: (v: string) => void
  /** Propone un skill que no existe en el catálogo. Lo conecta la feature de propuestas. */
  onPropose?: (text: string) => void
}

/**
 * Los skills solo salen del catálogo aprobado (FR-012). Lo que la persona
 * escribe se resuelve con resolveSkill —el mismo resolvedor que usa el
 * backend—, así que "React.js" o "reactjs" terminan guardados como `react`
 * (FR-013). Un texto que no corresponde a ningún skill NO se agrega: se ofrece
 * proponerlo.
 */
export function SkillsInput({ skills, onChange, inputValue, onInputChange, onPropose }: SkillsInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { catalog, loading, failed, reload } = useSkillCatalog()

  const typed = inputValue.trim()
  const resolved = typed ? resolveSkill(typed, catalog) : null
  const pending = unresolvedSkills(skills, catalog)

  /** Agrega un skill ya resuelto a su nombre canónico. */
  function addResolved(name: string) {
    if (!skills.includes(name)) onChange([...skills, name])
    onInputChange('')
    setShowSuggestions(false)
  }

  /** Lo que se intenta al presionar Enter o al salir del campo. */
  function commitTyped() {
    if (!typed) return
    if (resolved) {
      addResolved(resolved.name)
      return
    }
    // Sin coincidencia no se agrega nada: el texto se queda en el campo para
    // que la persona lo corrija o lo proponga.
    setShowSuggestions(true)
  }

  const suggestions = typed
    ? catalog.skills
        .filter(
          skill =>
            !skills.includes(skill.name) &&
            (skill.label.toLowerCase().includes(typed.toLowerCase()) ||
              skill.name.includes(typed.toLowerCase())),
        )
        .slice(0, 8)
    : []

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (suggestions.length > 0 && !resolved) {
        addResolved(suggestions[0].name)
        return
      }
      commitTyped()
    } else if (e.key === 'Backspace' && !inputValue && skills.length > 0) {
      onChange(skills.slice(0, -1))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Un fallo de red no es "no hay skills": si se tratara así, la persona
  // guardaría un perfil sin skills creyendo que no existen.
  if (failed) {
    return (
      <div className="skills-catalog-error" role="alert">
        No pudimos cargar el catálogo de skills.{' '}
        <button type="button" onClick={reload}>Reintentar</button>
      </div>
    )
  }

  return (
    <>
      <div className="skills-input-row" style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={loading ? 'Cargando skills...' : 'Ej. React, escribe y elige una sugerencia'}
          value={inputValue}
          disabled={loading}
          onChange={e => { onInputChange(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so a click on a suggestion registers before the list
            // disappears — onBlur otherwise fires first and hides it.
            blurTimeout.current = setTimeout(() => { commitTyped(); setShowSuggestions(false) }, 150)
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="skills-suggestions">
            {suggestions.map(skill => (
              <button
                key={skill.name}
                type="button"
                className="skills-suggestion"
                onMouseDown={e => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); addResolved(skill.name) }}
              >
                {skill.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {typed && !resolved && suggestions.length === 0 && !loading && (
        <div className="skills-propose-row">
          <span>«{typed}» no está en el catálogo.</span>
          {onPropose ? (
            <button
              type="button"
              className="skills-propose-button"
              onMouseDown={e => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current) }}
              onClick={() => { onPropose(typed); onInputChange('') }}
            >
              Proponer «{typed}»
            </button>
          ) : (
            <span className="muted">Elige uno de la lista.</span>
          )}
        </div>
      )}

      {skills.length > 0 && (
        <div className="skills-chips">
          {skills.map(skill => {
            const isPending = pending.includes(skill)
            return (
              <span key={skill} className={isPending ? 'skill-chip is-unresolved' : 'skill-chip'}>
                {skillLabel(skill, catalog)}
                {isPending && <em title="Este skill no está en el catálogo: cámbialo, proponlo o quítalo"> · fuera del catálogo</em>}
                <button type="button" onClick={() => onChange(skills.filter(s => s !== skill))} aria-label={`Quitar ${skill}`}><X size={11} /></button>
              </span>
            )
          })}
        </div>
      )}
    </>
  )
}

export function PhotoPicker({ photoUrl, onPick, onError }: { photoUrl: string | null; onPick: (dataUrl: string) => void; onError: (msg: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onError('El archivo debe ser una imagen')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      onError('La imagen no debe superar 3MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onPick(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="photo-picker-row">
      {photoUrl ? (
        <img src={photoUrl} alt="Vista previa" className="photo-picker-avatar" />
      ) : (
        <div className="photo-picker-avatar"><Sparkles size={22} /></div>
      )}
      <div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
        <button type="button" className="photo-picker-btn" onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={14} /> {photoUrl ? 'Cambiar foto' : 'Subir foto'}
        </button>
        <p className="photo-picker-hint">JPG, PNG o WEBP · máx. 3MB</p>
      </div>
    </div>
  )
}

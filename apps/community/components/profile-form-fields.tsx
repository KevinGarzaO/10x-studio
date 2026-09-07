'use client'

import { useRef, useState, KeyboardEvent } from 'react'
import { Sparkles, UploadCloud, X } from 'lucide-react'
import { CANONICAL_SKILLS } from '../lib/profile-options'

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

export function SkillsInput({ skills, onChange, inputValue, onInputChange }: { skills: string[]; onChange: (skills: string[]) => void; inputValue: string; onInputChange: (v: string) => void }) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function addSkill(raw: string) {
    const skill = raw.trim().toLowerCase()
    if (!skill || skills.includes(skill)) { onInputChange(''); return }
    onChange([...skills, skill])
    onInputChange('')
    setShowSuggestions(false)
  }

  const suggestions = inputValue.trim()
    ? CANONICAL_SKILLS.filter(s =>
        !skills.includes(s.value) &&
        (s.label.toLowerCase().includes(inputValue.trim().toLowerCase()) || s.value.includes(inputValue.trim().toLowerCase()))
      ).slice(0, 8)
    : []

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      // Enter with a visible, matching suggestion picks that canonical
      // value instead of whatever free text was typed, so it still matches
      // job postings tagged with the same token.
      addSkill(suggestions[0]?.value ?? inputValue)
    } else if (e.key === 'Backspace' && !inputValue && skills.length > 0) {
      onChange(skills.slice(0, -1))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <>
      <div className="skills-input-row" style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Ej. React, escribe y elige una sugerencia"
          value={inputValue}
          onChange={e => { onInputChange(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so a click on a suggestion registers before the list
            // disappears — onBlur otherwise fires first and hides it.
            blurTimeout.current = setTimeout(() => { addSkill(inputValue); setShowSuggestions(false) }, 150)
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="skills-suggestions">
            {suggestions.map(s => (
              <button
                key={s.value}
                type="button"
                className="skills-suggestion"
                onMouseDown={e => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); addSkill(s.value) }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {skills.length > 0 && (
        <div className="skills-chips">
          {skills.map(skill => (
            <span key={skill} className="skill-chip">
              {CANONICAL_SKILLS.find(s => s.value === skill)?.label ?? skill}
              <button type="button" onClick={() => onChange(skills.filter(s => s !== skill))} aria-label={`Quitar ${skill}`}><X size={11} /></button>
            </span>
          ))}
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

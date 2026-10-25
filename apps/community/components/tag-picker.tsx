'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useSkillCatalog } from '../lib/skill-catalog'
import { ROLE_CATEGORY_LABELS } from '../lib/profile-options'

export interface TagOption {
  /** Lo que se guarda en la publicación: el nombre del skill o la dirección del puesto (`ux-ui`). */
  key: string
  label: string
  kind: 'puesto' | 'skill'
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MAX_SUGGESTIONS = 8

/**
 * Las únicas etiquetas que existen: los puestos y los skills del catálogo. La persona escribe, se le muestra la lista
 * de lo que coincide y elige; no se puede inventar una etiqueta. Si un puesto y un skill se llaman igual (DevOps),
 * queda el skill.
 */
export function buildTagOptions(skills: { name: string; label: string }[]): TagOption[] {
  const options = new Map<string, TagOption>()
  for (const [role, label] of Object.entries(ROLE_CATEGORY_LABELS)) {
    if (role === 'otro') continue
    options.set(role.replace(/_/g, '-'), { key: role.replace(/_/g, '-'), label, kind: 'puesto' })
  }
  for (const skill of skills) options.set(skill.name, { key: skill.name, label: skill.label, kind: 'skill' })
  return [...options.values()]
}

/** Las opciones que coinciden con lo escrito, las que empiezan igual primero. */
export function matchTagOptions(options: TagOption[], query: string, chosen: string[]): TagOption[] {
  const needle = fold(query.trim())
  if (!needle) return []
  const hits = options
    .filter(option => !chosen.includes(option.key))
    .map(option => {
      const label = fold(option.label)
      const key = fold(option.key)
      const rank = label.startsWith(needle) || key.startsWith(needle) ? 0 : label.includes(needle) || key.includes(needle) ? 1 : 2
      return { option, rank }
    })
    .filter(hit => hit.rank < 2)
  hits.sort((a, b) => a.rank - b.rank || (a.option.kind === b.option.kind ? a.option.label.localeCompare(b.option.label) : a.option.kind === 'puesto' ? -1 : 1))
  return hits.slice(0, MAX_SUGGESTIONS).map(hit => hit.option)
}

export function TagPicker({ value, onChange, max }: { value: string[]; onChange: (tags: string[]) => void; max: number }) {
  const { catalog } = useSkillCatalog()
  const options = useMemo(() => buildTagOptions(catalog.skills), [catalog.skills])
  const byKey = useMemo(() => new Map(options.map(option => [option.key, option])), [options])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => matchTagOptions(options, query, value), [options, query, value])
  const full = value.length >= max

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function pick(option: TagOption) {
    if (full || value.includes(option.key)) return
    onChange([...value, option.key])
    setQuery('')
    setOpen(false)
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, Math.max(matches.length - 1, 0))) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' || event.key === ',') {
      // Enter solo elige de la lista: lo que no está en ella no se agrega.
      event.preventDefault()
      if (matches[active]) pick(matches[active])
    } else if (event.key === 'Escape') setOpen(false)
    else if (event.key === 'Backspace' && !query && value.length > 0) onChange(value.slice(0, -1))
  }

  const showList = open && query.trim().length > 0 && !full
  let lastKind = ''

  return (
    <div className="editor-tags tag-picker" ref={boxRef}>
      {value.map(key => (
        <span key={key} className="editor-tag">
          #{byKey.get(key)?.label ?? key}
          <button type="button" aria-label={`Quitar ${byKey.get(key)?.label ?? key}`} onClick={() => onChange(value.filter(item => item !== key))}><X size={13} /></button>
        </span>
      ))}
      {!full && (
        <input
          aria-label="Etiquetas"
          role="combobox"
          aria-expanded={showList}
          aria-controls="tag-options"
          autoComplete="off"
          value={query}
          onChange={event => { setQuery(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={value.length === 0 ? 'Busca un puesto o un skill…' : 'Agrega otra…'}
        />
      )}

      {showList && (
        <div className="tag-options" id="tag-options" role="listbox">
          {matches.length === 0 && <p className="tag-empty">Sin coincidencias. Solo puedes elegir puestos o skills de la lista.</p>}
          {matches.map((option, index) => {
            const heading = option.kind !== lastKind
            lastKind = option.kind
            return (
              <div key={option.key}>
                {heading && <p className="tag-group">{option.kind === 'puesto' ? 'Puestos' : 'Skills'}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`tag-option${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={event => { event.preventDefault(); pick(option) }}
                >
                  {option.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

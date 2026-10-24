'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building, Briefcase, Hash, Search, Target, User, X } from 'lucide-react'
import { getToken } from '../lib/session'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../lib/profile-options'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface SearchResults {
  q: string
  vacancies: { slug: string; title: string; company: string | null; location: string | null; modalidad: string | null; seniority: string | null }[]
  people: { username: string; displayName: string; photoUrl: string | null; roleCategory: string | null; seniority: string | null }[]
  companies: { name: string; slug: string; logo: string | null }[]
  skills: { name: string; label: string }[]
  roles: { role: string; slug: string; label: string }[]
}

interface Item {
  key: string
  group: string
  icon: React.ReactNode
  title: string
  detail?: string
  href: string
}

/** Aplana los resultados en una sola lista, en el orden en que se muestran, para poder moverse con el teclado. */
export function toItems(results: SearchResults | null): Item[] {
  if (!results) return []
  const known = (value: string | null | undefined) => (value && !/no especificado|unknown/i.test(value) ? value : null)
  return [
    ...results.vacancies.map(vacancy => ({
      key: `v-${vacancy.slug}`, group: 'Vacantes', icon: <Briefcase size={16} />, title: vacancy.title,
      detail: [vacancy.company, known(vacancy.modalidad), vacancy.seniority ? SENIORITY_LABELS[vacancy.seniority] || vacancy.seniority : null].filter(Boolean).join(' · '),
      href: `/vacantes/${vacancy.slug}`,
    })),
    ...results.people.map(person => ({
      key: `p-${person.username}`, group: 'Personas', icon: <User size={16} />, title: person.displayName,
      detail: [ROLE_CATEGORY_LABELS[person.roleCategory ?? ''], person.seniority ? SENIORITY_LABELS[person.seniority] || person.seniority : null].filter(Boolean).join(' · ') || `@${person.username}`,
      href: `/users/${person.username}`,
    })),
    ...results.companies.map(company => ({ key: `c-${company.slug}`, group: 'Empresas', icon: <Building size={16} />, title: company.name, href: `/empresas/${company.slug}` })),
    ...results.skills.map(skill => ({ key: `s-${skill.name}`, group: 'Skills', icon: <Hash size={16} />, title: skill.label, detail: 'Ver vacantes que lo piden', href: `/empleos/${encodeURIComponent(skill.name)}` })),
    ...results.roles.map(role => ({ key: `r-${role.slug}`, group: 'Puestos', icon: <Target size={16} />, title: role.label, detail: 'Ver vacantes del puesto', href: `/puestos/${role.slug}` })),
  ]
}

/**
 * La búsqueda de la barra superior: vacantes, personas, empresas, skills y puestos, con los datos reales.
 * Se escribe y los resultados aparecen agrupados; ↑ ↓ y Enter para moverse, Esc para cerrar, ⌘K o Ctrl+K para
 * enfocarla desde cualquier pantalla. Las personas solo aparecen con sesión.
 */
export function SearchBox() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(0)

  const items = useMemo(() => toItems(results), [results])
  const trimmed = query.trim()

  // Busca un instante después de que se deja de escribir, y descarta la respuesta de una búsqueda ya vieja.
  useEffect(() => {
    if (trimmed.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      const token = getToken()
      fetch(`${API_URL}/api/community/discover/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { setResults(data); setActive(0) })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [trimmed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setExpanded(true)
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) { setOpen(false); setExpanded(false) }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [])

  const go = useCallback((href: string) => {
    setOpen(false)
    setExpanded(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }, [router])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); setExpanded(false); inputRef.current?.blur() }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, Math.max(items.length - 1, 0))) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && items[active]) { event.preventDefault(); go(items[active].href) }
  }

  const showPanel = open && trimmed.length >= 2
  let lastGroup = ''

  return (
    <div className={`search-box${expanded ? ' is-expanded' : ''}`} ref={boxRef}>
      <div className="search-wrap" onClick={() => { setExpanded(true); inputRef.current?.focus() }}>
        <Search size={17} />
        <input
          ref={inputRef}
          value={query}
          onChange={event => { setQuery(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar vacantes, personas, empresas, skills..."
          aria-label="Buscar"
          aria-expanded={showPanel}
          aria-controls="search-results"
          role="combobox"
          autoComplete="off"
        />
        {query ? (
          <button type="button" className="search-clear" aria-label="Borrar búsqueda" onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus() }}><X size={14} /></button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </div>

      {showPanel && (
        <div className="search-pop" id="search-results" role="listbox">
          {loading && items.length === 0 && <p className="search-empty">Buscando…</p>}
          {!loading && results && items.length === 0 && <p className="search-empty">Sin resultados para «{trimmed}»</p>}
          {items.map((item, index) => {
            const heading = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.key}>
                {heading && <p className="search-group">{item.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`search-item${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item.href)}
                >
                  <span className="search-item-icon">{item.icon}</span>
                  <span className="search-item-text">
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

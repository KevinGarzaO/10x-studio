'use client'

import { useEffect, useState } from 'react'
import { normalizeSkillKey, resolveSkill, type SkillCatalog } from '@avocado/schemas'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const EMPTY: SkillCatalog = { skills: [], aliases: [] }

export interface UseSkillCatalog {
  catalog: SkillCatalog
  loading: boolean
  /** true cuando el catálogo no se pudo cargar. Ver la nota de abajo. */
  failed: boolean
  reload: () => void
}

/**
 * Carga el catálogo de skills aprobados desde el backend.
 *
 * `failed` existe para no repetir el error que ya vivimos en los exámenes: un
 * fallo de red no se puede tratar como "el catálogo está vacío". Quien use este
 * hook debe deshabilitar el guardado mientras `failed` sea true, en vez de
 * dejar a la persona creer que no hay skills disponibles.
 */
export function useSkillCatalog(): UseSkillCatalog {
  const [catalog, setCatalog] = useState<SkillCatalog>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)

    fetch(`${API_URL}/api/community/skills`)
      .then(res => {
        if (!res.ok) throw new Error('catalog_unavailable')
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setCatalog({ skills: data.skills || [], aliases: data.aliases || [] })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setCatalog(EMPTY)
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  return { catalog, loading, failed, reload: () => setAttempt(a => a + 1) }
}

/** Etiqueta visible de un skill; su propio nombre si no está en el catálogo. */
export function skillLabel(name: string, catalog: SkillCatalog): string {
  return catalog.skills.find(skill => skill.name === name)?.label ?? name
}

/** Los skills del perfil que no existen en el catálogo aprobado (FR-015). */
export function unresolvedSkills(skills: string[], catalog: SkillCatalog): string[] {
  const approved = new Set(catalog.skills.map(skill => skill.name))
  return skills.filter(skill => !approved.has(skill))
}

export { normalizeSkillKey, resolveSkill }
export type { SkillCatalog }

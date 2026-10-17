'use client'

import { useEffect, useState } from 'react'
import { normalizeSkillKey, resolveSkill, type SkillCatalog } from '@avocado/schemas'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const EMPTY: SkillCatalog = { skills: [], aliases: [] }

// El catálogo es el mismo para toda la pantalla: onboarding, ajustes y el campo
// de skills lo usan a la vez. Se comparte una sola petición en vuelo, y su
// resultado, para no pedirlo una vez por componente.
let cached: Promise<SkillCatalog> | null = null

function fetchCatalog(force = false): Promise<SkillCatalog> {
  if (!cached || force) {
    cached = fetch(`${API_URL}/api/community/skills`)
      .then(res => {
        if (!res.ok) throw new Error('catalog_unavailable')
        return res.json()
      })
      .then(data => {
        const catalog = { skills: data.skills || [], aliases: data.aliases || [] }
        // Un catálogo vacío no es un catálogo: la persona no podría elegir
        // ningún skill y el campo quedaría mudo. Se trata como no disponible.
        if (catalog.skills.length === 0) throw new Error('catalog_empty')
        return catalog
      })
      .catch(error => {
        // Un fallo no se cachea: el siguiente intento vuelve a pedirlo.
        cached = null
        throw error
      })
  }
  return cached
}

/** Solo para tests: olvida el catálogo cacheado. */
export function resetSkillCatalogCache() {
  cached = null
}

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

    fetchCatalog(attempt > 0)
      .then(data => {
        if (cancelled) return
        setCatalog(data)
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

/**
 * ¿El catálogo ya trae a qué roles pertenece cada skill? Si no (el backend es
 * anterior o la migración de roles no se aplicó), no hay con qué filtrar y el
 * selector ofrece todo, como antes.
 */
export function hasRoleData(catalog: SkillCatalog): boolean {
  return catalog.skills.some(skill => (skill.roleCategories?.length ?? 0) > 0)
}

/**
 * Los skills que tiene sentido ofrecer a quien eligió esa categoría de rol.
 * "Otro" y quien aún no eligió ven el catálogo completo.
 */
export function skillsForRole(catalog: SkillCatalog, roleCategory: string | null | undefined) {
  if (!roleCategory || roleCategory === 'otro' || !hasRoleData(catalog)) return catalog.skills
  return catalog.skills.filter(skill => skill.roleCategories?.includes(roleCategory))
}

/** Los skills del perfil que no existen en el catálogo aprobado (FR-015). */
export function unresolvedSkills(skills: string[], catalog: SkillCatalog): string[] {
  const approved = new Set(catalog.skills.map(skill => skill.name))
  return skills.filter(skill => !approved.has(skill))
}

export { normalizeSkillKey, resolveSkill }
export type { SkillCatalog }

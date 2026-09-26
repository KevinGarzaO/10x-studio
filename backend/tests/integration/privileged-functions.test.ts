import { describe, expect, it, afterAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { supabase } from '../../services/supabase.service'

/**
 * FR-004 y FR-005: el tipo de cuenta y el permiso de superadmin NO se cambian
 * desde la aplicación. La garantía está en la base de datos (trigger + funciones
 * con EXECUTE revocado), y este test cierra la otra mitad: que el backend
 * tampoco intente hacerlo por ningún camino.
 *
 * Es un test de código, no de red: recorre las fuentes buscando cualquier
 * mención de las funciones privilegiadas o de las columnas protegidas.
 */
const ROOT = join(__dirname, '..', '..')
const SOURCE_DIRS = ['src', 'services', 'routes', 'controllers']
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'tests', 'scripts'])

function collectSources(dir: string): string[] {
  let found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(collectSources(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      found.push(full)
    }
  }
  return found
}

const sources = SOURCE_DIRS.flatMap((dir) => collectSources(join(ROOT, dir)))

describe('privileged changes stay out of the application (T038)', () => {
  it('finds backend sources to scan', () => {
    expect(sources.length).toBeGreaterThan(10)
  })

  it.each(['change_account_type', 'set_superadmin'])(
    'no backend source calls %s',
    (fnName) => {
      const offenders = sources.filter((file) => readFileSync(file, 'utf8').includes(fnName))
      expect(offenders, `estas fuentes invocan ${fnName}`).toEqual([])
    },
  )

  it('no backend source writes account_type or is_superadmin', () => {
    // Se buscan asignaciones (`account_type:`), no lecturas: el middleware de
    // tipo de cuenta y el de superadmin sí tienen que leerlas.
    const writePatterns = [/account_type\s*:/, /is_superadmin\s*:/]
    const offenders = sources.filter((file) => {
      const content = readFileSync(file, 'utf8')
      return writePatterns.some((pattern) => pattern.test(content))
    })

    expect(offenders).toEqual([])
  })
})

describe('public signup creates a plain candidate (T040)', () => {
  const username = `t040-registro-${Date.now().toString(36)}`
  let createdId: string | null = null

  afterAll(async () => {
    if (createdId) await supabase.from('users').delete().eq('id', createdId)
  })

  // Reproduce lo que hace auth.routes.ts al registrar: inserta id, email,
  // username y display_name, sin tocar el tipo ni el permiso (FR-003, FR-030).
  it('leaves account_type at its default and no superadmin permission', async () => {
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email: `${username}@example.com`,
        display_name: 'Registro T040',
      })
      .select('id, account_type, is_superadmin')
      .single()

    expect(error).toBeNull()
    createdId = data!.id

    expect(data!.account_type).toBe('candidate')
    expect(data!.is_superadmin).toBe(false)
  })
})

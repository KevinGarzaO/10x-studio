import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Una tabla con PRIMARY KEY compuesto entre `users` y `community_posts` (las dos en el esquema público) la toma PostgREST
// como tabla "puente" y vuelve ambiguo el embed `author:users(...)`: se cae el feed y los perfiles (PGRST201).
describe('migraciones SQL', () => {
  it('ninguna tabla puente conecta public.users con community_posts', () => {
    const dir = join(__dirname, '../../sql')
    const offenders: string[] = []

    for (const file of readdirSync(dir).filter(name => name.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, file), 'utf-8').replace(/--.*$/gm, '')
      for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
        const [, name, body] = match
        const pk = body.match(/PRIMARY KEY\s*\(([^)]+)\)/i)
        if (!pk) continue
        const columns = pk[1].split(',').map(column => column.trim())
        const refersTo = (column: string, table: RegExp) => new RegExp(`\b${column}\b[^,\n]*REFERENCES\s+${table.source}`, 'i').test(body)
        const toUsers = columns.some(column => refersTo(column, /users\s*\(/)) && !columns.some(column => refersTo(column, /auth\.users/))
        const toPosts = columns.some(column => refersTo(column, /community_posts\s*\(/))
        if (toUsers && toPosts) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

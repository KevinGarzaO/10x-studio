import { Pool } from 'pg'
import type { Queryable } from './queries'

/**
 * Conexión de SOLO LECTURA. Cada consulta corre dentro de una transacción `READ ONLY` con tiempo límite: aunque alguien
 * añadiera por error una consulta que escribe, la base la rechazaría. Lo ideal además es conectar con un rol que solo
 * pueda leer lo necesario (ver el README).
 */
export function createReadOnlyDb(connectionString: string): Queryable & { close(): Promise<void> } {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString)
  const pool = new Pool({
    connectionString,
    max: 3,
    ssl: process.env.DATABASE_SSL === 'off' || local ? undefined : { rejectUnauthorized: false },
  })

  return {
    async query<T>(text: string, params?: unknown[]) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN READ ONLY')
        await client.query("SET LOCAL statement_timeout = '15s'")
        const result = await client.query(text, params as unknown[] | undefined)
        await client.query('ROLLBACK')
        return { rows: result.rows as T[] }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

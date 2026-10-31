#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createReadOnlyDb } from './db'
import { createServer } from './server'

/**
 * Servidor MCP de analítica de AvoTalent (se conecta por stdio: Claude Desktop / Claude Code lo lanzan).
 * Variables: DATABASE_URL (obligatoria, de preferencia un rol de solo lectura) y NEXT_PUBLIC_CLARITY_PROJECT_ID (opcional).
 * Ojo: por stdio NUNCA se escribe a la salida estándar nada que no sea el protocolo; los avisos van a stderr.
 */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL (conexión Postgres de solo lectura).')
    process.exit(1)
  }
  const db = createReadOnlyDb(url)
  const server = createServer(db, { clarityProjectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID })
  await server.connect(new StdioServerTransport())
  console.error('[avotalent-analytics] listo')

  const stop = () => void db.close().finally(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((error) => {
  console.error('[avotalent-analytics] no pudo arrancar:', error)
  process.exit(1)
})

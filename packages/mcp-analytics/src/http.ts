#!/usr/bin/env node
import './http/polyfills' // PRIMERO: el SDK necesita `crypto` global (ver polyfills.ts)
import { createReadOnlyDb } from './db'
import { createRemoteApp } from './http/app'
import { panelFromEnv } from './panel'
import { DEFAULT_ALLOWED_REDIRECTS } from './http/provider'

/**
 * Servidor MCP REMOTO de analítica de AvoTalent (para Railway). Variables de entorno:
 *
 *   DATABASE_URL           conexión Postgres del rol de SOLO LECTURA. En Railway va la del «Transaction pooler» de Supabase
 *                          (puerto 6543, usuario avo_mcp_reader.<proyecto>): la conexión directa solo funciona con IPv6.
 *   MCP_PUBLIC_URL         la dirección pública del servicio, https://...up.railway.app (sin barra final)
 *   MCP_TOKEN_SECRET       clave que firma todo (mínimo 32 caracteres, al azar)
 *   MCP_OWNER_KEY          la clave del dueño que se escribe al conectar Claude (mínimo 20 caracteres)
 *   MCP_TOKEN_EPOCH        (opcional, 1 por defecto) súbelo para cortar todo acceso ya emitido
 *   MCP_ALLOWED_REDIRECTS  (opcional) direcciones de regreso permitidas, separadas por coma
 *   NEXT_PUBLIC_CLARITY_PROJECT_ID (opcional)   PORT (lo pone Railway)
 *
 * Nunca se imprime una clave: si falta algo, se dice cuál variable y nada más.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Falta la variable ${name}.`)
    process.exit(1)
  }
  return value
}

async function main() {
  const db = createReadOnlyDb(required('DATABASE_URL'))
  const epoch = parseInt(process.env.MCP_TOKEN_EPOCH ?? '1', 10)
  const { app } = createRemoteApp({
    db,
    publicUrl: required('MCP_PUBLIC_URL'),
    secret: required('MCP_TOKEN_SECRET'),
    ownerKey: required('MCP_OWNER_KEY'),
    epoch: Number.isFinite(epoch) ? epoch : 1,
    allowedRedirects: process.env.MCP_ALLOWED_REDIRECTS ? process.env.MCP_ALLOWED_REDIRECTS.split(',').map((url) => url.trim()).filter(Boolean) : DEFAULT_ALLOWED_REDIRECTS,
    clarityProjectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
    panel: panelFromEnv(),
  })

  const port = Number(process.env.PORT ?? 3000)
  const server = app.listen(port, '0.0.0.0', () => console.log(`[avotalent-analytics] servidor MCP remoto escuchando en el puerto ${port}`))
  const stop = () => server.close(() => void db.close().finally(() => process.exit(0)))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((error) => {
  console.error('[avotalent-analytics] no pudo arrancar:', (error as Error).message)
  process.exit(1)
})

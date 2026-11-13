// Genera las llaves `anon` y `service_role` (JWT de 10 años) firmadas con JWT_SECRET, como las que Supabase entrega por proyecto.
//   JWT_SECRET=... node infra/scripts/make-keys.mjs
// Se imprimen en pantalla para copiarlas a tu archivo local de entorno: no las pegues en el chat ni las subas al repositorio.
import crypto from 'node:crypto'
const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) { console.error('Define JWT_SECRET (32 caracteres o más).'); process.exit(1) }
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const sign = (role) => {
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'avotalent', role, iat: now, exp: now + 10 * 365 * 86400 })}`
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
}
console.log(`SUPABASE_ANON_KEY=${sign('anon')}`)
console.log(`SUPABASE_SERVICE_KEY=${sign('service_role')}`)

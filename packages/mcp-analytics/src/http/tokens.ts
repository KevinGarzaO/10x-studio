import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Fichas firmadas sin guardar nada: un cliente registrado, un código de autorización y los tokens de acceso son un texto
 * `datos.firma` donde la firma es un HMAC-SHA256 con una clave que solo vive en el servidor (MCP_TOKEN_SECRET). Al no depender de
 * una base ni de la memoria, sobreviven a un reinicio o a un despliegue en Railway.
 *
 * Lo que firma lleva siempre su tipo (`t`), cuándo vence (`exp`, en segundos) y la «época» (`ep`): subir la época en el servidor
 * invalida de golpe todo lo emitido antes (el botón de emergencia), igual que cambiar la clave.
 */

export type TokenKind = 'client' | 'code' | 'access' | 'refresh'

export interface TokenPayload {
  t: TokenKind
  ep: number
  exp: number
  jti: string
  [key: string]: unknown
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url')

const mac = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest()

export const newId = (): string => randomBytes(16).toString('base64url')

/** Compara dos textos en tiempo constante (sin revelar cuánto coinciden), sea cual sea su largo. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}

export function sign(payload: Omit<TokenPayload, 'jti'> & { jti?: string }, secret: string): string {
  const body = b64(JSON.stringify({ jti: newId(), ...payload }))
  return `${body}.${b64(mac(body, secret))}`
}

/** Devuelve el contenido si la firma es válida, el tipo es el esperado, no ha vencido y es de la época vigente; si no, null. */
export function verify(token: string, secret: string, expected: TokenKind, epoch: number, nowSeconds: number): TokenPayload | null {
  if (typeof token !== 'string' || token.length > 4096) return null
  const dot = token.indexOf('.')
  if (dot < 1 || token.indexOf('.', dot + 1) !== -1) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  const real = mac(body, secret)
  if (given.length !== real.length || !timingSafeEqual(given, real)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
    if (payload.t !== expected || payload.ep !== epoch) return null
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null
    return payload
  } catch {
    return null
  }
}

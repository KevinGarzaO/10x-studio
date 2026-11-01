import { webcrypto } from 'node:crypto'

/**
 * El SDK de MCP usa `crypto.randomUUID()` como función global (la trae Node 20 en adelante). Si el servicio llegara a correr en
 * una versión más vieja (Railway usó Node 18 por defecto y por eso todo `initialize` fallaba con «crypto is not defined»),
 * se pone aquí. Va PRIMERO en el arranque, antes de cargar el SDK.
 */
if (!(globalThis as { crypto?: unknown }).crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}

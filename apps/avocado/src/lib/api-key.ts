/**
 * La llave de aplicación del panel (regla de diseño: toda API la exige; ver backend/middleware/api-key.middleware.ts). Cada llamada a las APIs lleva la
 * cabecera `x-api-key` con NEXT_PUBLIC_API_KEY. Viaja dentro de la página: es un IDENTIFICADOR del panel (sirve para medir, limitar y rotar), no un
 * secreto; la protección real son la sesión de superadmin y la protección de la página. Sin la variable no se agrega nada.
 */
export function apiKeyHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_API_KEY
  return key ? { 'x-api-key': key } : {}
}

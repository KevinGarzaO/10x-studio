import { installApiKey } from './lib/api-key'

/**
 * Se ejecuta una vez cuando arranca el servidor de Next. Hace que TODA llamada del servidor a nuestra API (páginas, metadatos, mapa del sitio,
 * intermediario de analítica) lleve la llave de aplicación; en el servidor se prefiere la llave secreta API_KEY_SERVER (ver lib/api-key.ts).
 */
export async function register() {
  installApiKey()
}

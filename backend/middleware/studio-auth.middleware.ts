import { Request, Response, NextFunction } from 'express'
import { communityAuthMiddleware, AuthRequest } from './community-auth.middleware'
import { requireSuperadmin } from '../src/middleware/require-superadmin.middleware'

/**
 * Acceso a las rutas del Studio (ajustes con el token de LinkedIn, temas, calendario, IA,
 * Substack...) y al panel de analítica: solo para quien tenga sesión Y sea superadmin.
 *
 * Antes el guardia de estas rutas era un marcador que dejaba pasar a todos: cualquiera que
 * conociera la dirección del backend podía leer y cambiar la configuración, incluido el token
 * de LinkedIn. Reusa el inicio de sesión de la comunidad y su permiso `is_superadmin`.
 *
 * @param options.isPublic  rutas que deben seguir abiertas (el redireccionamiento de OAuth que
 *                          abre una ventana sin sesión, contenido público...).
 * @param options.onlyFor   si se da, solo se protegen las rutas que lo cumplan: sirve para las
 *                          rutas que se montan en `/api` junto con otras que no son del Studio.
 */
export function studioAuth(options: { isPublic?: (req: Request) => boolean; onlyFor?: (req: Request) => boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Las peticiones de reconocimiento de CORS no llevan credenciales.
    if (req.method === 'OPTIONS') return next()
    if (options.onlyFor && !options.onlyFor(req)) return next()
    if (options.isPublic?.(req)) return next()

    communityAuthMiddleware(req as AuthRequest, res, (error?: unknown) => {
      if (error) return next(error)
      requireSuperadmin(req as AuthRequest, res, next)
    })
  }
}

/** Las rutas del Studio que cuelgan de `/api` sin prefijo propio (crud e IA). */
export const STUDIO_ROOT_PATHS = /^\/(topics|history|calendar|settings|templates|campaigns|generate|suggest)(\/|$)/

/** LinkedIn: el inicio y el regreso del OAuth se abren en una ventana sin sesión; el resto es del panel. */
export const isLinkedInPublic = (req: Request) =>
  req.method === 'GET' && (req.path === '/auth' || req.path === '/callback' || req.path === '/proxy-image')

/**
 * Blog: leer la lista y un artículo es público (es contenido publicado); generar, editar,
 * borrar y las estadísticas son del Studio.
 */
const BLOG_ADMIN_GETS = new Set(['/content-stats', '/content-items', '/dashboard-stats', '/web-posts', '/analytics/summary'])
export const isBlogPublic = (req: Request) =>
  req.method === 'GET' &&
  !BLOG_ADMIN_GETS.has(req.path) &&
  !req.path.startsWith('/web-posts/') &&
  !req.path.endsWith('/analytics') &&
  /^\/([^/]+)?$/.test(req.path)

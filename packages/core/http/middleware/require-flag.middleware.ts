import { Request, Response, NextFunction } from 'express'
import { getOptionalUserId } from '../../services/community/viewer'
import { isEnabled } from '../../services/flags/flags.service'

/**
 * Guardia de una ruta nueva: si la persona no tiene la función, la ruta «no existe» (404, igual que cualquier dirección inventada), así quien no
 * la ve tampoco puede descubrirla ni usarla llamando directo. Es la defensa real: esconder un botón en la pantalla no es un permiso.
 *
 *   router.post('/seguir', requireFlag('seguir_personas'), handler)
 */
export function requireFlag(key: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await getOptionalUserId(req).catch(() => null)
      if (await isEnabled(key, userId)) return next()
    } catch {
      // ante la duda, apagado
    }
    res.status(404).json({ error: 'Not found' })
  }
}

import type { NextFunction, Request, Response } from 'express'
import { ttlCache } from '../services/analytics/cache'

/**
 * Guarda unos minutos en memoria lo que el servidor contesta IGUAL para todo el mundo, para no recalcularlo en cada visita al feed
 * (las estadísticas de la barra lateral y la lista de artículos se leen en cada carga y tardaban hasta 5 s).
 *
 * Reglas para no mostrarle a una persona los datos de otra:
 *  - `only` dice QUÉ rutas se guardan (por defecto ninguna: se elige una por una, nunca «todo lo que cuelga de»).
 *  - `guestOnly`: solo se guarda lo que piden visitantes SIN sesión (sin encabezado Authorization). Lo que cambia según la cuenta
 *    (guardados, «Postulada», lo que se ve completo) jamás se guarda ni se sirve de lo guardado.
 *  - Solo respuestas 200 de GET; la llave es la dirección completa (con su query). El mapa tiene tope, así que no crece sin fin.
 */
export function publicCache(ms: number, options: { only: (path: string) => boolean; guestOnly?: boolean; inTests?: boolean }) {
  const cached = ttlCache(ms, (path) => !options.only(path), { inTests: options.inTests })
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.guestOnly && req.headers.authorization) return next()
    return cached(req, res, next)
  }
}

import type { NextFunction, Request, Response } from 'express'

interface Entry { at: number; body: unknown }

/**
 * Guarda unos segundos la respuesta de las consultas del panel: cada una lee miles de filas y los números
 * no cambian de un segundo a otro. Las ven solo superadmins, así que la respuesta es la misma para todos.
 * `?fresh=1` se salta lo guardado (el botón de recargar del panel) y deja la respuesta nueva guardada.
 * En pruebas no guarda nada, para que cada prueba vea sus propios datos.
 */
export function ttlCache(ms: number, skip: (path: string) => boolean = () => false) {
  const entries = new Map<string, Entry>()

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || ms <= 0 || process.env.NODE_ENV === 'test' || skip(req.path)) return next()

    const key = req.originalUrl.replace(/([?&])fresh=1&?/, '$1').replace(/[?&]$/, '')
    const hit = entries.get(key)
    if (hit && Date.now() - hit.at < ms && req.query.fresh !== '1') return res.json(hit.body)

    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        entries.set(key, { at: Date.now(), body })
        // Que el mapa no crezca sin fin si alguien prueba muchas combinaciones.
        if (entries.size > 200) entries.delete(entries.keys().next().value as string)
      }
      return send(body)
    }
    next()
  }
}

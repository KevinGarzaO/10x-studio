import { Request, Response, NextFunction } from 'express'

/**
 * Guards internal/admin-only endpoints (manual scraper triggers, etc.) with
 * a shared secret instead of leaving them wide open on a public Railway URL.
 * Fails closed: if ADMIN_SECRET isn't configured, the endpoint refuses
 * every request rather than silently falling back to "no auth".
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.ADMIN_SECRET
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_SECRET no está configurado en el servidor' })
  }

  const provided = req.headers['x-admin-secret']
  if (provided !== expected) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  next()
}

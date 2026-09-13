import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middleware/community-auth.middleware'
import { supabase } from '../../services/supabase.service'

/**
 * Must run after communityAuthMiddleware, which sets req.userId.
 * roles isn't attached to the request by that middleware, so this looks it
 * up directly — kept in its own middleware (rather than folded into
 * communityAuthMiddleware) so routes that don't need a role check don't pay
 * for the extra query.
 */
export const requireRole = (role: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    const { data, error } = await supabase
      .from('users')
      .select('roles')
      .eq('id', req.userId)
      .maybeSingle()

    if (error || !data?.roles?.includes(role)) {
      return res.status(403).json({ error: 'forbidden', message: 'No tienes permisos para esta acción' })
    }

    next()
  }
}

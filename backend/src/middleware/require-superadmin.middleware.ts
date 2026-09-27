import { Response, NextFunction } from 'express'
import { AuthRequest } from '../../middleware/community-auth.middleware'
import { supabase } from '../../services/supabase.service'

/**
 * Must run after communityAuthMiddleware, which sets req.userId.
 *
 * Replaces the earlier requireRole('admin'): the permission now lives in its
 * own column (users.is_superadmin) instead of users.roles, which the scraper
 * also writes job keywords into — a scraped profile carrying the keyword
 * "admin" could otherwise have been granted this (FR-005).
 *
 * Kept as its own middleware (rather than folded into
 * communityAuthMiddleware) so routes that don't need the check don't pay for
 * the extra query.
 */
export const requireSuperadmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data, error } = await supabase
    .from('users')
    .select('is_superadmin')
    .eq('id', req.userId)
    .maybeSingle()

  if (error || !data?.is_superadmin) {
    return res
      .status(403)
      .json({ error: 'forbidden', message: 'No tienes permisos para esta acción' })
  }

  next()
}

import { Response, NextFunction } from 'express'
import type { AccountType } from '@avocado/schemas'
import { AuthRequest } from '../../middleware/community-auth.middleware'
import { supabase } from '../../services/supabase.service'

const MESSAGES: Record<AccountType, string> = {
  candidate: 'Esta sección es solo para candidatos',
  company: 'Esta sección es solo para empresas',
}

const ERRORS: Record<AccountType, string> = {
  candidate: 'candidates_only',
  company: 'companies_only',
}

/**
 * Must run after communityAuthMiddleware, which sets req.userId.
 *
 * Gates a route by account type (FR-008). Today only the candidate side
 * exists, but the check has to be in place before companies can sign in
 * (part 2 of the requirement) — and it also covers the edge case of an
 * account whose type is changed while it has an exam in progress.
 */
export const requireAccountType = (type: AccountType) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    const { data, error } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', req.userId)
      .maybeSingle()

    if (error || !data) {
      return res.status(403).json({ error: ERRORS[type], message: MESSAGES[type] })
    }

    if (data.account_type !== type) {
      return res.status(403).json({ error: ERRORS[type], message: MESSAGES[type] })
    }

    next()
  }
}

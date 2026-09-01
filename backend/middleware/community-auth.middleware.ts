import { Request, Response, NextFunction } from 'express'
import { supabase } from '../services/supabase.service'

export interface AuthRequest extends Request {
  userId?: string
  userEmail?: string
}

export const communityAuthMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' })
  }

  const token = authHeader.split(' ')[1]

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }

  req.userId = data.user.id
  req.userEmail = data.user.email

  next()
}

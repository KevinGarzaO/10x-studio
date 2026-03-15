import { Request, Response, NextFunction } from 'express'

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Placeholder para autenticación
  // En un entorno real, aquí se verificaría un JWT o una sesión
  // Por ahora dejamos pasar todas las peticiones
  next()
}

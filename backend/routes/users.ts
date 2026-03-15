import { Router } from 'express'
import * as UsersController from '../controllers/users.controller'

const router = Router()

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Obtener información del usuario actual
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Datos del usuario
 */
router.get('/me', UsersController.getMe)

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Actualizar datos del usuario actual
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 */
router.put('/me', UsersController.updateMe)

export default router

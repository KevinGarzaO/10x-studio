import { Router } from 'express'
import * as AiController from '../controllers/ai.controller'

const router = Router()

/**
 * @swagger
 * /api/generate:
 *   post:
 *     summary: Generar contenido usando AI
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Contenido generado
 */
router.post('/generate', AiController.generate)

/**
 * @swagger
 * /api/generate/substack:
 *   post:
 *     summary: Generar un artículo o nota optimizada para Substack usando IA
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Título, subtítulo y contenido estructurado del artículo
 */
router.post('/generate/substack', AiController.generateSubstack)

/**
 * @swagger
 * /api/suggest:
 *   post:
 *     summary: Sugerir temas usando AI
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Temas sugeridos
 */
router.post('/suggest', AiController.suggest)

/**
 * @swagger
 * /api/suggest/web:
 *   post:
 *     summary: Sugerir temas usando IA con busqueda web
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Temas sugeridos usando internet
 */
router.post('/suggest/web', AiController.suggestWeb)

export default router

import { Router } from 'express'
import * as SubstackController from '../controllers/substack.controller'

const router = Router()

/**
 * @swagger
 * /api/substack/profile:
 *   get:
 *     summary: Obtener perfil del usuario desde Supabase
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Perfil del usuario
 */
router.get('/debug', SubstackController.debugDB)
router.get('/profile', SubstackController.getProfile)

/**
 * @swagger
 * /api/substack/posts:
 *   get:
 *     summary: Obtener lista de posts desde Supabase
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Lista de posts
 */
router.get('/posts', SubstackController.getPosts)

/**
 * @swagger
 * /api/substack/subscribers:
 *   get:
 *     summary: Obtener lista de suscriptores desde Supabase
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Lista de suscriptores
 */
router.get('/subscribers', SubstackController.getSubscribers)

/**
 * @swagger
 * /api/substack/stats:
 *   get:
 *     summary: Obtener estadísticas desde Supabase
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Estadísticas del usuario
 */
router.get('/stats', SubstackController.getStats)



/**
 * @swagger
 * /api/substack/drafts/create:
 *   post:
 *     summary: Crear un nuevo draft en Substack
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Draft creado
 */
router.post('/drafts/create', SubstackController.createDraft)

/**
 * @swagger
 * /api/substack/drafts/update/{id}:
 *   put:
 *     summary: Actualizar un draft existente
 *     tags: [Substack]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Draft actualizado
 */
router.put('/drafts/update/:id', SubstackController.updateDraft)

/**
 * @swagger
 * /api/substack/drafts/schedule:
 *   post:
 *     summary: Programar la publicación de un draft
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Draft programado
 */
router.post('/drafts/schedule', SubstackController.scheduleDraft)

/**
 * @swagger
 * /api/substack/image:
 *   post:
 *     summary: Subir imagen base64 a Substack
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: URL de imagen devuelta
 */
router.post('/image', SubstackController.uploadImage)
router.get('/posts/:type', SubstackController.getSubstackPosts)
/**
 * @swagger
 * /api/substack/subscriber/add:
 *   post:
 *     summary: Añadir un nuevo suscriptor
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Suscriptor añadido
 */
router.post('/subscriber/add', SubstackController.addSubscriber)

/**
 * @swagger
 * /api/substack/publish:
 *   post:
 *     summary: Publicar un artículo completo (Draft + Schedule)
 *     tags: [Substack]
 *     responses:
 *       200:
 *         description: Artículo publicado/programado
 */
router.post('/publish', SubstackController.publishArticle)

/**
 * @swagger
 * /api/substack/cookies/{userId}:
 *   get:
 *     summary: Obtener cookies de un usuario
 *     tags: [Substack]
 */
router.get('/cookies/:userId', SubstackController.getCookies)

/**
 * @swagger
 * /api/substack/cookies:
 *   post:
 *     summary: Guardar o actualizar cookies
 *     tags: [Substack]
 */
router.post('/cookies', SubstackController.upsertCookies)

/**
 * @swagger
 * /api/substack/cookies:
 *   delete:
 *     summary: Eliminar cookies (desconectar)
 *     tags: [Substack]
 */
router.delete('/cookies', SubstackController.deleteCookies)

export default router

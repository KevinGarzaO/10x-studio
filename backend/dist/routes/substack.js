"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SubstackController = __importStar(require("../controllers/substack.controller"));
const router = (0, express_1.Router)();
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
router.get('/debug', SubstackController.debugDB);
router.get('/profile', SubstackController.getProfile);
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
router.get('/posts', SubstackController.getPosts);
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
router.get('/subscribers', SubstackController.getSubscribers);
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
router.get('/stats', SubstackController.getStats);
/**
 * @swagger
 * /api/substack/notes:
 *   post:
 *     summary: Crear una nota en Substack
 *     tags: [Substack]
 *     body:
 *       content: string
 *     responses:
 *       200:
 *         description: Nota creada
 */
router.post('/notes', SubstackController.createNote);
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
router.post('/drafts/create', SubstackController.createDraft);
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
router.put('/drafts/update/:id', SubstackController.updateDraft);
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
router.post('/drafts/schedule', SubstackController.scheduleDraft);
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
router.post('/subscriber/add', SubstackController.addSubscriber);
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
router.post('/publish', SubstackController.publishArticle);
/**
 * @swagger
 * /api/substack/cookies/{userId}:
 *   get:
 *     summary: Obtener cookies de un usuario
 *     tags: [Substack]
 */
router.get('/cookies/:userId', SubstackController.getCookies);
/**
 * @swagger
 * /api/substack/cookies:
 *   post:
 *     summary: Guardar o actualizar cookies
 *     tags: [Substack]
 */
router.post('/cookies', SubstackController.upsertCookies);
/**
 * @swagger
 * /api/substack/cookies:
 *   delete:
 *     summary: Eliminar cookies (desconectar)
 *     tags: [Substack]
 */
router.delete('/cookies', SubstackController.deleteCookies);
exports.default = router;

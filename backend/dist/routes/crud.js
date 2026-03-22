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
const CrudController = __importStar(require("../controllers/crud.controller"));
const router = (0, express_1.Router)();
/**
 * @swagger
 * /api/topics:
 *   get:
 *     summary: Obtener todos los temas guardados
 *     tags: [CRUD - Temas]
 *   post:
 *     summary: Crear un nuevo tema
 *     tags: [CRUD - Temas]
 *   put:
 *     summary: Actualizar un tema existente
 *     tags: [CRUD - Temas]
 *   delete:
 *     summary: Eliminar un tema por su id
 *     tags: [CRUD - Temas]
 */
// Topics
router.get('/topics', CrudController.getCollection('topics'));
router.post('/topics', CrudController.createItem('topics'));
router.put('/topics', CrudController.updateItem('topics'));
router.delete('/topics', CrudController.deleteItem('topics'));
/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Obtener el historial de artículos generados
 *     tags: [CRUD - Historial]
 *   post:
 *     summary: Agregar artículo al historial
 *     tags: [CRUD - Historial]
 *   delete:
 *     summary: Eliminar registro del historial
 *     tags: [CRUD - Historial]
 */
// History
router.get('/history', CrudController.getCollection('history'));
router.post('/history', CrudController.createItem('history'));
router.delete('/history', CrudController.deleteItem('history'));
/**
 * @swagger
 * /api/calendar:
 *   get:
 *     summary: Obtener eventos del calendario
 *     tags: [CRUD - Calendario]
 *   post:
 *     summary: Crear un nuevo evento en el calendario
 *     tags: [CRUD - Calendario]
 *   put:
 *     summary: Modificar un evento del calendario
 *     tags: [CRUD - Calendario]
 *   delete:
 *     summary: Eliminar un evento del calendario
 *     tags: [CRUD - Calendario]
 */
// Calendar
router.get('/calendar', CrudController.getCollection('calendar'));
router.post('/calendar', CrudController.createItem('calendar'));
router.put('/calendar', CrudController.updateItem('calendar'));
router.delete('/calendar', CrudController.deleteItem('calendar'));
/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Obtener la configuración o preferencias globales de la app
 *     tags: [CRUD - Preferencias]
 *   post:
 *     summary: Guardar o actualizar la configuración
 *     tags: [CRUD - Preferencias]
 */
// Settings
router.get('/settings', CrudController.getSingular('settings', {}));
router.post('/settings', CrudController.saveSingular('settings'));
/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Obtener plantillas
 *     tags: [CRUD - Plantillas]
 *   post:
 *     summary: Crear una nueva plantilla
 *     tags: [CRUD - Plantillas]
 *   put:
 *     summary: Actualizar una plantilla
 *     tags: [CRUD - Plantillas]
 *   delete:
 *     summary: Eliminar una plantilla
 *     tags: [CRUD - Plantillas]
 */
// Templates
router.get('/templates', CrudController.getCollection('templates'));
router.post('/templates', CrudController.createItem('templates'));
router.put('/templates', CrudController.updateItem('templates'));
router.delete('/templates', CrudController.deleteItem('templates'));
/**
 * @swagger
 * /api/campaigns:
 *   get:
 *     summary: Obtener campañas publicadas y guardadas
 *     tags: [CRUD - Campañas]
 *   post:
 *     summary: Registrar nueva campaña
 *     tags: [CRUD - Campañas]
 *   put:
 *     summary: Actualizar datos de campaña
 *     tags: [CRUD - Campañas]
 *   delete:
 *     summary: Eliminar campaña
 *     tags: [CRUD - Campañas]
 */
// Campaigns
router.get('/campaigns', CrudController.getCollection('campaigns'));
router.post('/campaigns', CrudController.createItem('campaigns'));
router.put('/campaigns', CrudController.updateItem('campaigns'));
router.delete('/campaigns', CrudController.deleteItem('campaigns'));
exports.default = router;

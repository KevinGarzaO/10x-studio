import { Router } from 'express'
import * as CrudController from '../controllers/crud.controller'

const router = Router()

// Topics
router.get('/topics', CrudController.getCollection('topics'))
router.post('/topics', CrudController.saveCollection('topics'))
router.put('/topics', CrudController.saveCollection('topics'))
router.delete('/topics', CrudController.saveCollection('topics')) // Original logic re-saves whole collection

// History
router.get('/history', CrudController.getCollection('history'))
router.post('/history', CrudController.saveCollection('history'))
router.delete('/history', CrudController.saveCollection('history'))

// Calendar
router.get('/calendar', CrudController.getCollection('calendar'))
router.post('/calendar', CrudController.saveCollection('calendar'))
router.put('/calendar', CrudController.saveCollection('calendar'))
router.delete('/calendar', CrudController.saveCollection('calendar'))

// Settings
router.get('/settings', CrudController.getSingular('settings', {}))
router.post('/settings', CrudController.saveSingular('settings'))

// Templates
router.get('/templates', CrudController.getCollection('templates'))
router.post('/templates', CrudController.saveCollection('templates'))
router.put('/templates', CrudController.saveCollection('templates'))
router.delete('/templates', CrudController.saveCollection('templates'))

// Campaigns
router.get('/campaigns', CrudController.getCollection('campaigns'))
router.post('/campaigns', CrudController.saveCollection('campaigns'))
router.put('/campaigns', CrudController.saveCollection('campaigns'))
router.delete('/campaigns', CrudController.saveCollection('campaigns'))

export default router

import { Router } from 'express'
import {
  linkedinAuth,
  linkedinCallback,
  getLinkedInProfile,
  deleteLinkedInProfile,
  linkedinPost,
  linkedinProxyImage,
  getLinkedInPosts,
  getTrackedPosts,
  createTrackedPost,
  deleteTrackedPost,
} from '../controllers/linkedin.controller'

const router = Router()

router.get('/auth',        linkedinAuth)
router.get('/callback',    linkedinCallback)
router.get('/profile',     getLinkedInProfile)
router.delete('/profile',  deleteLinkedInProfile)
router.get('/proxy-image', linkedinProxyImage)
router.get('/posts',       getLinkedInPosts)
router.post('/post',       linkedinPost)

// Registro de publicaciones con medición (reporte por utm_content)
router.get('/registry',        getTrackedPosts)
router.post('/registry',       createTrackedPost)
router.delete('/registry/:id', deleteTrackedPost)

export default router

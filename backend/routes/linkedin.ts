import { Router } from 'express'
import { linkedinAuth, linkedinCallback, linkedinPost, linkedinProxyImage, getLinkedInPosts } from '../controllers/linkedin.controller'

const router = Router()

router.get('/auth',        linkedinAuth)
router.get('/callback',    linkedinCallback)
router.get('/proxy-image', linkedinProxyImage)
router.get('/posts',       getLinkedInPosts)
router.post('/post',       linkedinPost)

export default router

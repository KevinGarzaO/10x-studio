import { Router } from 'express'
import { 
  generateBlog, 
  listBlogPosts, 
  getBlogPost, 
  updateBlogPost, 
  deleteBlogPost,
  getBlogAnalytics,
  getAnalyticsSummary,
  getWebPosts,
  getWebPostDetail
} from '../controllers/blog.controller'

const router = Router()

/**
 * @swagger
 * /api/blog/generate:
 *   post:
 *     summary: Generate a new blog post with AI
 *     tags: [Blog]
 */
router.post('/generate', generateBlog)

/**
 * @swagger
 * /api/blog/web-posts:
 *   get:
 *     summary: Get web blog posts with analytics from post_events
 *     tags: [Blog]
 */
router.get('/web-posts', getWebPosts)

/**
 * @swagger
 * /api/blog/web-posts/{postId}:
 *   get:
 *     summary: Get web post detail with analytics
 *     tags: [Blog]
 */
router.get('/web-posts/:postId', getWebPostDetail)

/**
 * @swagger
 * /api/blog/analytics/summary:
 *   get:
 *     summary: Get analytics summary for all posts
 *     tags: [Blog]
 */
router.get('/analytics/summary', getAnalyticsSummary)

/**
 * @swagger
 * /api/blog:
 *   get:
 *     summary: List all blog posts
 *     tags: [Blog]
 */
router.get('/', listBlogPosts)

/**
 * @swagger
 * /api/blog/{id}:
 *   get:
 *     summary: Get blog post by ID
 *     tags: [Blog]
 */
router.get('/:id', getBlogPost)

/**
 * @swagger
 * /api/blog/{id}:
 *   put:
 *     summary: Update blog post
 *     tags: [Blog]
 */
router.put('/:id', updateBlogPost)

/**
 * @swagger
 * /api/blog/{id}:
 *   delete:
 *     summary: Delete blog post
 *     tags: [Blog]
 */
router.delete('/:id', deleteBlogPost)

/**
 * @swagger
 * /api/blog/{id}/analytics:
 *   get:
 *     summary: Get analytics for a blog post
 *     tags: [Blog]
 */
router.get('/:id/analytics', getBlogAnalytics)

export default router

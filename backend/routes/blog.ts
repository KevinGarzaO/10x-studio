import { Router } from 'express'
import { 
  generateBlog, 
  listBlogPosts, 
  getBlogPost, 
  updateBlogPost, 
  deleteBlogPost,
  getBlogAnalytics,
  getAnalyticsSummary
} from '../controllers/blog.controller'

const router = Router()

/**
 * @swagger
 * /api/blog/generate:
 *   post:
 *     summary: Generate a new blog post with AI
 *     tags: [Blog]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: string
 *               length:
 *                 type: string
 *               tone:
 *                 type: string
 *               extract:
 *                 type: string
 *               destination:
 *                 type: string
 *                 enum: [web, substack, wordpress]
 */
router.post('/generate', generateBlog)

/**
 * @swagger
 * /api/blog:
 *   get:
 *     summary: List all blog posts
 *     tags: [Blog]
 *     parameters:
 *       - in: query
 *         name: destination
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
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

/**
 * @swagger
 * /api/blog/analytics/summary:
 *   get:
 *     summary: Get analytics summary for all posts
 *     tags: [Blog]
 */
router.get('/analytics/summary', getAnalyticsSummary)

export default router

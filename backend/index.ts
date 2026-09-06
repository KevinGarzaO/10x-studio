import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import dotenv from 'dotenv'
import substackRoutes from './routes/substack'
import usersRoutes from './routes/users'
import crudRoutes from './routes/crud'
import aiRoutes from './routes/ai'
import linkedinRoutes from './routes/linkedin'
import blogRoutes from './routes/blog'
import sitemapRoutes from './routes/sitemap'
import { linkedinCallback } from './controllers/linkedin.controller'
import { initCron } from './services/cron.service'
import { authMiddleware } from './middleware/auth.middleware'
import { communityAuthMiddleware } from './middleware/community-auth.middleware'

// Community Hub routes
import communityAuthRoutes from './src/routes/community/auth.routes'
import communityPostsRoutes from './src/routes/community/posts.routes'
import communityCommentsRoutes from './src/routes/community/comments.routes'
import communityUsersRoutes from './src/routes/community/users.routes'
import communitySavedRoutes from './src/routes/community/saved.routes'
import faviconRoutes from './src/routes/community/favicon.routes'

// Scraper routes
import scraperRoutes from './routes/scraper'

import path from 'path'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'https://acovado-forum-i26ft1bbw-transformateck.vercel.app',
      'https://acovado-forum-er1yfnx7c-transformateck.vercel.app',
      'https://avocado-forum.vercel.app',
    ]
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(null, true)
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '15mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Swagger config
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '10X Studio API',
      version: '1.0.0',
      description: 'API de 10X Studio - Migrada de Next.js API Routes'
    },
    servers: [
      { url: '/', description: 'Servidor Actual' },
      { url: `http://localhost:${PORT}`, description: 'Localhost' }
    ]
  },
  apis: ['./routes/*.ts', './routes/*.js']
}

const swaggerDocs = swaggerJsdoc(swaggerOptions)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))

// Routes
app.use('/api', authMiddleware, crudRoutes)
app.use('/api', authMiddleware, aiRoutes)
app.use('/api/substack', authMiddleware, substackRoutes)
app.use('/api/users', authMiddleware, usersRoutes)
app.use('/api/blog', authMiddleware, blogRoutes)
// LinkedIn: callback is public (OAuth redirect), rest requires auth
app.get('/api/linkedin/callback', linkedinCallback)
app.use('/api/linkedin', authMiddleware, linkedinRoutes)

// Community Hub routes (public auth endpoints, protected community endpoints)
app.use('/api/community/auth', communityAuthRoutes)
app.use('/api/community/posts', communityPostsRoutes)
app.use('/api/community/posts', communityCommentsRoutes)
app.use('/api/community/users', communityUsersRoutes)
app.use('/api/community/saved', communityAuthMiddleware, communitySavedRoutes)
app.use('/api/community/favicon', faviconRoutes)

// Scraper routes (internal use, no auth required for now)
app.use('/api/scraper', scraperRoutes)

// Sitemap (public, no auth)
app.use(sitemapRoutes)

// Root route
app.get('/', (req, res) => {
  res.send('10X Studio API is running')
})

// Start Cron
initCron()

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`)
})

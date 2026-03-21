import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import dotenv from 'dotenv'
import substackRoutes from './routes/substack'
import usersRoutes from './routes/users'
import crudRoutes from './routes/crud'
import aiRoutes from './routes/ai'
import { initCron } from './services/cron.service'
import { authMiddleware } from './middleware/auth.middleware'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '15mb' }))

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

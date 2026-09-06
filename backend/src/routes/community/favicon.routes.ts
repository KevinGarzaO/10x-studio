import { Router, Request, Response } from 'express'
import https from 'https'
import http from 'http'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const domain = req.query.domain as string
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain' })
  }

  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`

  try {
    const proxyRes = await new Promise<http.IncomingMessage>((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, resolve).on('error', reject)
    })

    if (proxyRes.statusCode !== 200) {
      return res.status(404).json({ error: 'Favicon not found' })
    }

    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    proxyRes.pipe(res)
  } catch {
    res.status(502).json({ error: 'Failed to fetch favicon' })
  }
})

export default router

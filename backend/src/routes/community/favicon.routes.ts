import { Router, Request, Response } from 'express'
import https from 'https'
import http from 'http'

const router = Router()

function fetchImage(url: string, timeout = 8000): Promise<{ buffer: Buffer; contentType: string } | null> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href
        fetchImage(loc, timeout).then(resolve)
        res.resume()
        return
      }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return }
      const ct = res.headers['content-type'] || ''
      if (!ct.includes('image')) { res.resume(); resolve(null); return }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => { if (size < 500000) { chunks.push(c); size += c.length } })
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: ct }))
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

router.get('/', async (req: Request, res: Response) => {
  const domain = req.query.domain as string
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain' })
  }

  // Strategy 1: Clearbit Logo API (clean, cropped logos)
  const clearbitUrl = `https://logo.clearbit.com/${domain}?size=256`
  const clearbit = await fetchImage(clearbitUrl)
  if (clearbit && clearbit.buffer.length > 1000) {
    res.setHeader('Content-Type', clearbit.contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800')
    return res.send(clearbit.buffer)
  }

  // Strategy 2: Company website specific paths (clean icon files)
  const iconPaths = [
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/favicon-192x192.png',
    '/favicon-256x256.png',
    '/logo.png',
    '/logo.svg',
    '/icon.png',
    '/icon.svg',
  ]

  for (const path of iconPaths) {
    const imgUrl = `https://${domain}${path}`
    const img = await fetchImage(imgUrl)
    if (img && img.buffer.length > 500) {
      res.setHeader('Content-Type', img.contentType)
      res.setHeader('Cache-Control', 'public, max-age=604800')
      return res.send(img.buffer)
    }
  }

  // Strategy 3: Google Favicon (fallback, smaller quality)
  const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`
  const google = await fetchImage(googleUrl)
  if (google && google.buffer.length > 200) {
    res.setHeader('Content-Type', google.contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.send(google.buffer)
  }

  res.status(404).json({ error: 'No logo found' })
})

export default router

import { Router, Request, Response } from 'express'
import { isPublicContainer, isSafePath, readFile } from '../../services/storage'

/**
 * Sirve las imágenes públicas (fotos, imágenes de publicaciones, logos) desde los contenedores PRIVADOS de Azure: el navegador nunca habla con
 * Azure, solo con el backend. Solo `avatars`, `images` y `company-logos`; los documentos de empresas (`company-docs`) NO se sirven por aquí,
 * únicamente con un enlace firmado que vence en minutos. Solo imágenes: cualquier otro tipo se entrega como descarga ciega.
 *
 *   GET /api/files/<contenedor>/<ruta>
 */
const router = Router()

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

router.get('/:container/*', async (req: Request, res: Response) => {
  const container = req.params.container
  const path = (req.params as Record<string, string>)[0] ?? ''
  if (!isPublicContainer(container) || !isSafePath(path)) return res.status(404).json({ error: 'No encontrado' })

  const file = await readFile(container, path)
  if (!file) return res.status(404).json({ error: 'No encontrado' })
  if (req.headers['if-none-match'] && file.etag && req.headers['if-none-match'] === file.etag) {
    file.stream.destroy()
    return res.status(304).end()
  }

  const type = IMAGE_TYPES.has(file.contentType) ? file.contentType : 'application/octet-stream'
  res.setHeader('Content-Type', type)
  if (file.size !== null) res.setHeader('Content-Length', String(file.size))
  if (file.etag) res.setHeader('ETag', file.etag)
  // Los nombres llevan la fecha, no cambian: un día en el navegador y en los cachés alcanza.
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  file.stream.on('error', () => res.destroy())
  file.stream.pipe(res)
})

export default router

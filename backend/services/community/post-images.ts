import { supabase } from '../supabase.service'

/**
 * Imágenes de las publicaciones de los miembros (la portada y las que van dentro del texto). Se suben al almacenamiento
 * propio, en `images/community/`, y solo se aceptan las que están ahí: una publicación nunca apunta a una imagen de
 * cualquier otro sitio.
 */
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const BUCKET = 'images'

export type ParsedImage = { ok: true; mime: string; buffer: Buffer } | { ok: false; error: string }

export function parseImageDataUrl(dataUrl: unknown): ParsedImage {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'Falta la imagen.' }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match || !MIME_EXT[match[1].toLowerCase()]) return { ok: false, error: 'La imagen debe ser PNG, JPG, WEBP o GIF.' }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) return { ok: false, error: 'La imagen está vacía.' }
  if (buffer.length > MAX_IMAGE_BYTES) return { ok: false, error: 'La imagen pesa más de 5 MB.' }
  return { ok: true, mime: match[1].toLowerCase(), buffer }
}

/** Lo que toda imagen de una publicación debe tener al principio de su dirección. */
export const communityImagePrefix = (): string => `${(process.env.SUPABASE_URL || '').replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/community/`

export function isCommunityImageUrl(url: unknown): url is string {
  const prefix = communityImagePrefix()
  return typeof url === 'string' && prefix.startsWith('http') && url.startsWith(prefix) && !url.includes('..')
}

export async function uploadPostImage(dataUrl: unknown, userId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed.ok) return parsed

  const path = `community/${userId}-${Date.now()}.${MIME_EXT[parsed.mime]}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false })
  if (error) {
    console.error('[PostImage] No se pudo subir la imagen:', error.message)
    return { ok: false, error: 'No se pudo subir la imagen. Intenta de nuevo.' }
  }
  return { ok: true, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}

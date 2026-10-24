import { supabase } from './supabase.service'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function uploadBuffer(buffer: Buffer, mimeType: string, userId: string): Promise<string | null> {
  const ext = MIME_EXT[mimeType] || 'png'
  const filePath = `${userId}-${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(filePath, buffer, { contentType: mimeType, upsert: false })

  if (uploadErr) {
    console.error('[Avatar] Error uploading to Supabase Storage:', uploadErr.message)
    return null
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return urlData.publicUrl
}

/**
 * Uploads a base64 data URL (from a browser file input) to the public
 * "avatars" bucket and returns its public URL. Mirrors the pattern in
 * services/image.service.ts's uploadToSupabase.
 */
export async function uploadAvatar(dataUrl: string, userId: string): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (!match) {
      console.error('[Avatar] Invalid data URL format')
      return null
    }
    const [, mimeType, base64] = match
    return await uploadBuffer(Buffer.from(base64, 'base64'), mimeType, userId)
  } catch (error) {
    console.error('[Avatar] Error in uploadAvatar:', error)
    return null
  }
}

/**
 * Las redes sociales entregan la foto como un enlace firmado que VENCE (el de LinkedIn dura unas tres semanas)
 * y que algunos navegadores bloquean. Por eso la foto se copia a nuestro almacenamiento al registrarse: ese
 * enlace no vence. Solo se copian imágenes de estos dominios (nunca una dirección que mande el usuario), para
 * que el servidor no pueda usarse para pedir cualquier URL.
 */
const PROVIDER_PHOTO_HOSTS = [/(^|\.)licdn\.com$/i, /(^|\.)githubusercontent\.com$/i, /(^|\.)googleusercontent\.com$/i]
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000

/** Si el enlace es la foto de una red social (y por tanto vence), y no una foto ya guardada con nosotros. */
export function isProviderPhoto(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && PROVIDER_PHOTO_HOSTS.some((host) => host.test(parsed.hostname))
  } catch {
    return false
  }
}

/**
 * Copia la foto de una red social a nuestro almacenamiento y devuelve el enlace nuevo, o `null` si no se pudo
 * (enlace vencido, no es imagen, pesa demasiado...). Quien llama conserva entonces el enlace original: nunca
 * se pierde una foto por un fallo de la copia.
 */
export async function mirrorProviderPhoto(url: string | null | undefined, userId: string): Promise<string | null> {
  if (!isProviderPhoto(url)) return null
  try {
    const response = await fetch(url as string, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!MIME_EXT[mimeType]) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null

    return await uploadBuffer(buffer, mimeType, userId)
  } catch (error) {
    console.warn('[Avatar] No se pudo copiar la foto de la red social:', error instanceof Error ? error.message : error)
    return null
  }
}

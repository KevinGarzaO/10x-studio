import { supabase } from './supabase.service'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
    const ext = MIME_EXT[mimeType] || 'png'
    const filePath = `${userId}-${Date.now()}.${ext}`
    const buffer = Buffer.from(base64, 'base64')

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, { contentType: mimeType, upsert: false })

    if (uploadErr) {
      console.error('[Avatar] Error uploading to Supabase Storage:', uploadErr.message)
      return null
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    return urlData.publicUrl
  } catch (error) {
    console.error('[Avatar] Error in uploadAvatar:', error)
    return null
  }
}

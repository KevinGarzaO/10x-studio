import { supabase } from './supabase.service'

const BUCKET = 'company-docs'

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** 8 MB: un acta constitutiva escaneada cabe de sobra. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

export interface UploadedDocument {
  storagePath: string
  fileName: string
}

/**
 * Sube un documento legal de un reclamo al bucket **privado** `company-docs`.
 *
 * A diferencia de los avatares, estos archivos no tienen URL pública: se leen
 * con la llave de servicio (el superadmin al revisar) y se borran en cuanto el
 * reclamo se decide. Por eso la función devuelve la ruta en el bucket, no una
 * URL.
 */
export async function uploadClaimDocument(
  dataUrl: string,
  claimId: string,
  kind: string,
  fileName: string,
): Promise<UploadedDocument | { error: string }> {
  const match = dataUrl.match(/^data:([a-zA-Z/+.-]+);base64,(.+)$/)
  if (!match) return { error: 'invalid_file' }

  const [, mimeType, base64] = match
  const ext = MIME_EXT[mimeType]
  if (!ext) return { error: 'unsupported_type' }

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) return { error: 'file_too_large' }

  const storagePath = `${claimId}/${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false })

  if (error) {
    console.error('[ClaimDocs] Error subiendo documento:', error.message)
    return { error: 'upload_failed' }
  }

  return { storagePath, fileName }
}

/** Borra los archivos de un reclamo del bucket. No toca las filas. */
export async function removeClaimFiles(storagePaths: string[]): Promise<boolean> {
  if (storagePaths.length === 0) return true
  const { error } = await supabase.storage.from(BUCKET).remove(storagePaths)
  if (error) {
    console.error('[ClaimDocs] Error borrando documentos:', error.message)
    return false
  }
  return true
}

/**
 * Enlace temporal para que el superadmin revise un documento. Expira pronto a
 * propósito: estos archivos no deben poder compartirse.
 */
export async function signedDocumentUrl(storagePath: string, seconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds)
  if (error) {
    console.error('[ClaimDocs] Error firmando documento:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}

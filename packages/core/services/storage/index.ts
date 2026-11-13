import type { Readable } from 'stream'
import type { BlobServiceClient, BlobSASPermissions, SASProtocol } from '@azure/storage-blob'
import { supabase } from '../supabase.service'

/**
 * Archivos de AvoTalent (fotos, imágenes de publicaciones, logos, documentos de empresas). UNA sola puerta: el resto del backend no habla
 * con Supabase Storage ni con Azure, solo con este módulo.
 *
 * Dos motores, elegidos con `STORAGE_DRIVER`:
 *  - `supabase` (por omisión, lo de hoy): no cambia nada hasta que se decida.
 *  - `azure`: Azure Blob Storage con contenedores PRIVADOS. Nada se sirve directo desde Azure: las imágenes públicas (avatars, images,
 *    company-logos) las sirve el backend en `/api/files/<contenedor>/<ruta>` (ver files.routes.ts) y los documentos de empresas
 *    (company-docs) solo salen con un enlace firmado que vence en minutos.
 *
 * Variables del motor Azure: `AZURE_STORAGE_CONNECTION_STRING` (propia de cada entorno, solo en Railway) y `FILES_BASE_URL` (la dirección
 * pública de ESTE backend, sin barra final, para armar los enlaces de las imágenes).
 */
export type Container = 'avatars' | 'images' | 'company-logos' | 'company-docs' | 'backups'
/** Contenedores cuyo contenido se muestra al público por el proxy del backend. company-docs y backups NUNCA. */
export const PUBLIC_CONTAINERS: readonly Container[] = ['avatars', 'images', 'company-logos']
export const ALL_CONTAINERS: readonly Container[] = ['avatars', 'images', 'company-logos', 'company-docs', 'backups']

export type StorageDriver = 'supabase' | 'azure'
export const storageDriver = (env: NodeJS.ProcessEnv = process.env): StorageDriver => (env.STORAGE_DRIVER?.trim().toLowerCase() === 'azure' ? 'azure' : 'supabase')

export const isPublicContainer = (name: string): name is Container => (PUBLIC_CONTAINERS as readonly string[]).includes(name)

/** Una ruta de archivo válida: sin «..», sin barras al inicio, sin caracteres raros. Se valida antes de tocar el almacenamiento. */
export const isSafePath = (path: string): boolean => path.length > 0 && path.length <= 300 && !path.startsWith('/') && !path.includes('..') && !path.includes('\\') && /^[\w\-./ ]+$/.test(path)

// ---------------------------------------------------------------------------------------------------------------------
// Azure (se carga solo cuando se usa)
// ---------------------------------------------------------------------------------------------------------------------
let azureService: BlobServiceClient | null = null
const ensured = new Set<string>()

// La librería de Azure se carga SOLO cuando el motor es azure: con Supabase (producción hoy) ni se toca.
export interface AzureSdk { BlobServiceClient: typeof BlobServiceClient; BlobSASPermissions: typeof BlobSASPermissions; SASProtocol: typeof SASProtocol }
let sdkOverride: AzureSdk | null = null
const sdk = (): AzureSdk => sdkOverride ?? (require('@azure/storage-blob') as AzureSdk)

/** Solo para pruebas: usa una librería de Azure simulada. */
export function setAzureSdkForTest(mock: AzureSdk | null) {
  sdkOverride = mock
}

function azure(): BlobServiceClient {
  if (!azureService) {
    const connection = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connection) throw new Error('Falta AZURE_STORAGE_CONNECTION_STRING')
    azureService = sdk().BlobServiceClient.fromConnectionString(connection)
  }
  return azureService
}

async function azureContainer(name: Container) {
  const container = azure().getContainerClient(name)
  if (!ensured.has(name)) {
    await container.createIfNotExists() // sin `access`: privado
    ensured.add(name)
  }
  return container
}

/** Para pruebas. */
export function resetStorageForTest() {
  azureService = null
  ensured.clear()
}

// ---------------------------------------------------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------------------------------------------------
export async function putFile(container: Container, path: string, data: Buffer, options: { contentType: string; upsert?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSafePath(path)) return { ok: false, error: 'ruta inválida' }
  if (storageDriver() === 'azure') {
    try {
      const blob = (await azureContainer(container)).getBlockBlobClient(path)
      await blob.uploadData(data, {
        blobHTTPHeaders: { blobContentType: options.contentType },
        // upsert:false = no pisar un archivo que ya existe (igual que Supabase)
        conditions: options.upsert ? undefined : { ifNoneMatch: '*' },
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  const { error } = await supabase.storage.from(container).upload(path, data, { contentType: options.contentType, upsert: options.upsert ?? false })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function removeFiles(container: Container, paths: string[]): Promise<boolean> {
  const safe = paths.filter(isSafePath)
  if (safe.length === 0) return true
  if (storageDriver() === 'azure') {
    try {
      const client = await azureContainer(container)
      await Promise.all(safe.map((path) => client.getBlockBlobClient(path).deleteIfExists()))
      return true
    } catch {
      return false
    }
  }
  const { error } = await supabase.storage.from(container).remove(safe)
  return !error
}

/** Lo que toda dirección pública de un contenedor empieza igual (sirve para aceptar solo nuestras imágenes). */
export function publicFilePrefix(container: Container, env: NodeJS.ProcessEnv = process.env): string {
  if (storageDriver(env) === 'azure') return `${(env.FILES_BASE_URL || '').replace(/\/+$/, '')}/api/files/${container}/`
  return `${(env.SUPABASE_URL || '').replace(/\/+$/, '')}/storage/v1/object/public/${container}/`
}

export function publicFileUrl(container: Container, path: string): string {
  if (storageDriver() === 'azure') return `${publicFilePrefix(container)}${path}`
  return supabase.storage.from(container).getPublicUrl(path).data.publicUrl
}

/** Enlace temporal de lectura (documentos privados). Vence pronto a propósito. */
export async function signedFileUrl(container: Container, path: string, seconds = 300): Promise<string | null> {
  if (!isSafePath(path)) return null
  if (storageDriver() === 'azure') {
    try {
      const blob = (await azureContainer(container)).getBlobClient(path)
      return await blob.generateSasUrl({ permissions: sdk().BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + seconds * 1000), protocol: sdk().SASProtocol.Https })
    } catch {
      return null
    }
  }
  const { data, error } = await supabase.storage.from(container).createSignedUrl(path, seconds)
  return error ? null : data?.signedUrl ?? null
}

export interface FileStream { stream: Readable; contentType: string; size: number | null; etag: string | null }

/** Lectura para el proxy público. Solo existe con el motor Azure (con Supabase las imágenes salen directo de su dirección pública). */
export async function readFile(container: Container, path: string): Promise<FileStream | null> {
  if (storageDriver() !== 'azure' || !isSafePath(path)) return null
  try {
    const blob = (await azureContainer(container)).getBlobClient(path)
    const response = await blob.download()
    if (!response.readableStreamBody) return null
    return { stream: response.readableStreamBody as unknown as Readable, contentType: response.contentType || 'application/octet-stream', size: response.contentLength ?? null, etag: response.etag ?? null }
  } catch {
    return null
  }
}

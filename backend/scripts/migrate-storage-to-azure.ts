/**
 * Copia TODOS los archivos de Supabase Storage a Azure Blob (contenedores privados) y verifica cada uno. Solo LEE de Supabase; solo ESCRIBE en
 * Azure. Se puede repetir: lo que ya está en Azure con el mismo tamaño y huella se salta.
 *
 *   npx tsx scripts/migrate-storage-to-azure.ts            # ensayo: lista y cuenta, no copia nada
 *   npx tsx scripts/migrate-storage-to-azure.ts --apply    # copia y verifica
 *   ... --buckets images,company-logos                       # solo esos contenedores
 *
 * Necesita SOURCE_SUPABASE_URL y SOURCE_SUPABASE_SERVICE_KEY (el Supabase de ORIGEN; si faltan, SUPABASE_URL y SUPABASE_SERVICE_KEY) y AZURE_STORAGE_CONNECTION_STRING (el
 * entorno de DESTINO). Termina con error si algún archivo no quedó idéntico (tamaño y SHA-256). Después se reescriben las direcciones de la base
 * con infra/db/rewrite-file-urls.sql.
 */
import 'dotenv/config'
import crypto from 'crypto'
import { BlobServiceClient } from '@azure/storage-blob'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
// --buckets images,company-logos: copiar solo esos (en pre-produccion NO se copian las fotos de perfil de personas reales).
const onlyBuckets = (() => { const i = process.argv.indexOf('--buckets'); return i > -1 ? (process.argv[i + 1] ?? '').split(',').map((b) => b.trim()).filter(Boolean) : null })()
const PAGE = 1000
const sha = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

async function listObjects(supabase: any, bucket: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null || item.id === undefined) found.push(...(await listObjects(supabase, bucket, full)))
      else found.push(full)
    }
    if (!data || data.length < PAGE) break
  }
  return found
}

async function main() {
  const url = process.env.SOURCE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SOURCE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  const connection = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (el Supabase de origen)')
  if (apply && !connection) throw new Error('Falta AZURE_STORAGE_CONNECTION_STRING (el entorno de destino)')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const azure = connection ? BlobServiceClient.fromConnectionString(connection) : null

  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`No se pudieron listar los buckets: ${error.message}`)

  let total = 0, copied = 0, skipped = 0, bytes = 0
  const failed: string[] = []
  for (const bucket of (buckets ?? []).filter((b) => !onlyBuckets || onlyBuckets.includes(b.name))) {
    const objects = await listObjects(supabase, bucket.name)
    total += objects.length
    console.log(`${bucket.name}: ${objects.length} archivos (${bucket.public ? 'público' : 'privado'} en origen)`)
    if (!apply || !azure) continue

    const container = azure.getContainerClient(bucket.name)
    await container.createIfNotExists() // privado
    for (const object of objects) {
      try {
        const { data, error: downloadError } = await supabase.storage.from(bucket.name).download(object)
        if (downloadError || !data) throw new Error(downloadError?.message ?? 'sin datos')
        const buffer = Buffer.from(await data.arrayBuffer())
        const blob = container.getBlockBlobClient(object)

        if (await blob.exists()) {
          const existing = Buffer.from(await blob.downloadToBuffer())
          if (existing.length === buffer.length && sha(existing) === sha(buffer)) { skipped++; continue }
        }
        await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: data.type || 'application/octet-stream' } })

        // Verificación: se vuelve a leer desde Azure y debe ser idéntico.
        const back = Buffer.from(await blob.downloadToBuffer())
        if (back.length !== buffer.length || sha(back) !== sha(buffer)) throw new Error('el archivo en Azure no coincide con el original')
        copied++
        bytes += buffer.length
      } catch (e) {
        failed.push(`${bucket.name}/${object}: ${(e as Error).message}`)
      }
    }
  }

  console.log(apply ? `Copiados ${copied}, ya estaban ${skipped}, fallaron ${failed.length} de ${total} (${(bytes / 1048576).toFixed(1)} MB nuevos)` : `Ensayo: ${total} archivos por copiar. Nada se copió (usa --apply).`)
  if (failed.length) { failed.slice(0, 20).forEach((line) => console.error('FALLA', line)); process.exit(1) }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })

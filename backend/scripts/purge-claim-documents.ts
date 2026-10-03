/**
 * Borra los documentos legales de los reclamos ya decididos.
 *
 * El requerimiento es explícito: los documentos **se eliminan al aprobar o
 * rechazar**, y queda solo la constancia de qué tipo de documento se revisó.
 * Postgres no puede borrar archivos del bucket, así que esto corre aquí,
 * después de que el superadmin decide en SQL.
 *
 *   npm run purge-claim-docs
 *
 * Es seguro correrlo cuantas veces haga falta: solo toca documentos de
 * reclamos aprobados o rechazados que todavía tengan archivo.
 */
import { supabase } from '../services/supabase.service'
import { removeClaimFiles } from '../services/claim-documents'

async function main() {
  const { data, error } = await supabase
    .from('company_claim_documents')
    .select('id, storage_path, claim:company_claims!inner(id, status, company_name)')
    .not('storage_path', 'is', null)
    .in('claim.status', ['approved', 'rejected'])

  if (error) {
    console.error('No se pudieron leer los documentos:', error.message)
    process.exit(1)
  }

  const pending = data || []
  if (pending.length === 0) {
    console.log('No hay documentos por borrar: todo lo decidido ya está limpio.')
    return
  }

  const paths = pending.map(row => row.storage_path as string)
  const removed = await removeClaimFiles(paths)

  if (!removed) {
    console.error('El bucket rechazó el borrado; las filas se dejan intactas para reintentar.')
    process.exit(1)
  }

  for (const row of pending) {
    await supabase
      .from('company_claim_documents')
      .update({ storage_path: null, purged_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  console.log(`Borrados ${pending.length} documentos de reclamos ya decididos.`)
}

main().catch(error => {
  console.error('Error inesperado:', error)
  process.exit(1)
})

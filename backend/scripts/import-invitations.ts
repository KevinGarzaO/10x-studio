/**
 * Carga la lista de contactos en la cola de invitaciones. Los archivos se quedan donde están (no se copian al repo)
 * y solo se imprimen conteos, nunca correos.
 *
 *   npm run import-invitations -- --substack "C:\ruta\subscriber-export.csv" --lista "C:\ruta\total_emails.csv"           (solo cuenta)
 *   npm run import-invitations -- --substack ... --lista ... --apply                                                          (guarda en la cola)
 *
 * La cola va primero los suscriptores de Substack y después el resto. Puedes volver a correrlo con archivos nuevos:
 * lo que ya está en la cola no se repite.
 * Necesita backend/sql/invitations-migration.sql aplicada.
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { supabase } from '../services/supabase.service'
import { parseCsv } from '../services/email/csv'
import { newInviteCode, normalizeContacts } from '../services/email/invitations'

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const read = (path: string) => {
  const raw = readFileSync(path)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw) } catch { return new TextDecoder('latin1').decode(raw) }
}

async function main() {
  const rows: { email: string; name: string; source: string }[] = []
  const substack = arg('--substack')
  const lista = arg('--lista')
  if (!substack && !lista) throw new Error('Indica al menos un archivo: --substack ruta.csv y/o --lista ruta.csv')

  if (substack) for (const row of parseCsv(read(substack))) rows.push({ email: row['Email'] ?? '', name: row['Name'] ?? '', source: 'substack' })
  if (lista) for (const row of parseCsv(read(lista))) rows.push({ email: row['Email'] ?? '', name: `${row['First Name'] ?? ''} ${row['Last Name'] ?? ''}`.trim(), source: 'lista' })

  const contacts = normalizeContacts(rows)
  const withName = contacts.filter(contact => contact.firstName).length
  console.log(`Filas leídas: ${rows.length} · correos únicos y válidos: ${contacts.length} · con nombre: ${withName} · sin nombre: ${contacts.length - withName}`)
  for (const source of ['substack', 'lista']) console.log(`  entran por "${source}": ${contacts.filter(contact => contact.source === source).length}`)

  const { data: existing, error } = await supabase.from('invitations').select('email, position')
  if (error) throw new Error('Falta aplicar backend/sql/invitations-migration.sql en Supabase.')
  const known = new Set((existing ?? []).map(row => String(row.email).toLowerCase()))
  const fresh = contacts.filter(contact => !known.has(contact.email))
  console.log(`Ya estaban en la cola: ${contacts.length - fresh.length} · nuevos: ${fresh.length}`)

  if (!process.argv.includes('--apply')) { console.log('\n(Solo conteo: no se guardó nada. Agrega --apply para guardar.)'); return }

  let position = Math.max(0, ...(existing ?? []).map(row => Number(row.position))) + 1
  for (let start = 0; start < fresh.length; start += 200) {
    const batch = fresh.slice(start, start + 200).map(contact => ({ code: newInviteCode(), email: contact.email, first_name: contact.firstName, source: contact.source, position: position++ }))
    const { error: insertError } = await supabase.from('invitations').insert(batch)
    if (insertError) throw new Error(`No se pudo guardar: ${insertError.message}`)
  }
  console.log(`\nGuardados ${fresh.length} en la cola.`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

/**
 * Cómo van las invitaciones: envío por correo (entregado, abierto, clic, rebote) y registros que trajeron.
 *
 *   npm run invite-report
 *
 * Solo imprime conteos. Los estados vienen de Resend y se actualizan en cada corrida diaria.
 * "Se registraron desde un correo" = la cuenta se creó con el código del enlace (o con el mismo correo) DESPUÉS de
 * que se le mandó la primera invitación; quien ya tenía cuenta antes no cuenta como logro de las invitaciones.
 */
import 'dotenv/config'
import { supabase } from '../services/supabase.service'
import { loadState } from '../services/email/invitations'

const pct = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)} %` : '—')

async function main() {
  const { invitations, sends } = await loadState()
  if (invitations.length === 0) { console.log('La cola está vacía: falta importar la lista (npm run import-invitations).'); return }

  const sent = sends.filter(send => send.status === 'sent')
  console.log(`\nCola: ${invitations.length} · con enviada la primera: ${sent.filter(send => send.step === 1).length} · la última: ${sent.filter(send => send.step === 2).length} · fallidos: ${sends.filter(send => send.status === 'failed').length}`)

  for (const step of [1, 2]) {
    const rows = sent.filter(send => send.step === step)
    if (rows.length === 0) continue
    const events = (...names: string[]) => rows.filter(send => names.includes(send.last_event ?? '')).length
    const delivered = events('delivered', 'opened', 'clicked')
    console.log(`\nInvitación ${step} (${rows.length} enviadas):`)
    console.log(`  entregadas: ${delivered} (${pct(delivered, rows.length)}) · abiertas: ${events('opened', 'clicked')} (${pct(events('opened', 'clicked'), rows.length)}) · con clic: ${events('clicked')} (${pct(events('clicked'), rows.length)})`)
    console.log(`  rebotaron: ${events('bounced')} · marcaron spam: ${events('complained')} · sin dato todavía: ${rows.filter(send => !send.last_event || send.last_event === 'sent').length}`)
    if (rows.every(send => !send.last_event)) console.log('  (Sin estados: la llave de Resend solo puede enviar y no puede leerlos. Hace falta una llave con acceso completo.)')
  }

  const firstSent = new Map(sent.filter(send => send.step === 1).map(send => [send.invitation_id, send.created_at]))
  const ids = invitations.filter(inv => inv.user_id).map(inv => inv.user_id!)
  const { data: users } = ids.length ? await supabase.from('users').select('id, created_at, profile_completed, signup_content').in('id', ids) : { data: [] }
  const byId = new Map((users ?? []).map(user => [user.id as string, user]))

  const registered = invitations.filter(inv => inv.user_id && firstSent.has(inv.id) && Date.parse(byId.get(inv.user_id)?.created_at ?? '') > Date.parse(firstSent.get(inv.id)!))
  const viaLink = registered.filter(inv => byId.get(inv.user_id!)?.signup_content === inv.code)
  const completed = registered.filter(inv => byId.get(inv.user_id!)?.profile_completed)
  const before = invitations.filter(inv => inv.user_id && !registered.includes(inv)).length
  const neverEmailed = invitations.filter(inv => inv.user_id && !firstSent.has(inv.id)).length
  const invited = firstSent.size

  console.log(`\nSe registraron después de la invitación: ${registered.length} de ${invited} invitadas (${pct(registered.length, invited)})`)
  console.log(`  entraron con el enlace del correo: ${viaLink.length} · completaron el perfil: ${completed.length}`)
  console.log(`  ya tenían cuenta y por eso no se les escribió: ${neverEmailed}${before > neverEmailed ? ` · se registraron antes de que les llegara: ${before - neverEmailed}` : ''}`)
  for (const source of ['substack', 'lista']) {
    const group = invitations.filter(inv => inv.source === source && firstSent.has(inv.id))
    const joined = registered.filter(inv => inv.source === source).length
    if (group.length) console.log(`  lista "${source}": ${joined} de ${group.length} (${pct(joined, group.length)})`)
  }

  const { data: visits } = await supabase.from('landing_visits').select('visitor_id, campaign').eq('medium', 'invitacion')
  const visitors = new Set((visits ?? []).map(visit => visit.visitor_id as string))
  console.log(`\nLlegadas al sitio desde las invitaciones (visitantes distintos, panel de origen): ${visitors.size}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

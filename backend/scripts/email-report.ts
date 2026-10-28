/**
 * Cómo le fue a un correo: a cuántas personas se envió, cuántas llegaron desde él, cuántas completaron el perfil
 * después y cuántas se dieron de baja.
 *
 *   npm run email-report                  el recordatorio de perfil pendiente
 *   npm run email-report -- --events      además pide a Resend qué pasó con cada correo (entregado, abierto, clic)
 *
 * Aperturas y clics dependen de que el seguimiento esté activo en el dominio dentro de Resend. Lo que sí se mide
 * siempre, sin Resend: llegadas al sitio (enlaces con utm_campaign), perfiles completados y bajas.
 */
import 'dotenv/config'
import { Resend } from 'resend'
import { supabase } from '../services/supabase.service'
import { REMINDER_CAMPAIGN, REMINDER_KIND } from '../services/email/profile-reminder'

interface Sent {
  user_id: string
  status: string
  resend_id: string | null
  created_at: string
  error: string | null
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const pct = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)} %` : '—')

async function main() {
  const { data: rows, error } = await supabase.from('email_sends').select('user_id, status, resend_id, created_at, error').eq('kind', REMINDER_KIND)
  if (error) { console.error('Falta aplicar backend/sql/email-reminders-migration.sql (o no se pudo leer email_sends).'); process.exit(1) }
  const sends = (rows ?? []) as Sent[]
  const sent = sends.filter(row => row.status === 'sent')
  console.log(`\nCorreo "${REMINDER_KIND}"`)
  if (sends.length === 0) { console.log('Todavía no se ha enviado a nadie.'); return }
  console.log(`Enviados: ${sent.length} · fallidos: ${sends.filter(row => row.status === 'failed').length} · primer envío: ${sends.map(row => row.created_at).sort()[0].slice(0, 16).replace('T', ' ')}`)

  const ids = sent.map(row => row.user_id)
  const { data: people } = await supabase.from('users').select('id, profile_completed, email_opt_out').in('id', ids)
  const now = (people ?? []) as { id: string; profile_completed: boolean | null; email_opt_out: boolean | null }[]
  const completed = now.filter(person => person.profile_completed).length
  const optedOut = now.filter(person => person.email_opt_out).length
  console.log(`\nCompletaron el perfil después: ${completed} de ${sent.length} (${pct(completed, sent.length)})`)
  console.log(`Se dieron de baja: ${optedOut} (${pct(optedOut, sent.length)})`)

  const { data: visits } = await supabase.from('landing_visits').select('visitor_id').eq('campaign', REMINDER_CAMPAIGN)
  const visitors = new Set(((visits ?? []) as { visitor_id: string }[]).map(visit => visit.visitor_id))
  console.log(`Llegadas al sitio desde el correo (visitantes distintos): ${visitors.size}`)

  if (process.argv.includes('--events')) {
    if (!process.env.RESEND_API_KEY) { console.error('\nPara --events falta RESEND_API_KEY.'); process.exit(1) }
    const resend = new Resend(process.env.RESEND_API_KEY)
    const counts: Record<string, number> = {}
    for (const row of sent) {
      if (!row.resend_id) continue
      const { data } = await resend.emails.get(row.resend_id)
      const event = (data as { last_event?: string } | null)?.last_event ?? 'desconocido'
      counts[event] = (counts[event] ?? 0) + 1
      await sleep(600)
    }
    console.log('\nÚltimo evento de cada correo en Resend:')
    for (const [event, count] of Object.entries(counts)) console.log(`  ${event}: ${count}`)
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

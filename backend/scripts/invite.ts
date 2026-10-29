/**
 * Invitaciones por correo: ver cómo va la cola y, si lo pides, mandar la tanda de hoy.
 *
 *   npm run invite                       cómo va la cola y cuántos tocaría hoy (no envía nada)
 *   npm run invite -- --send [--limit 5] manda la tanda de hoy (calentamiento y cupo diario incluidos)
 *
 * El proceso automático hace lo mismo todos los días a las 11:00 (Monterrey) cuando INVITE_EMAILS=on en el servidor.
 * Necesita backend/sql/invitations-migration.sql y RESEND_API_KEY.
 */
import 'dotenv/config'
import { activeDaysBefore, dailyCap, loadState, pickDue, runInvitationBatch } from '../services/email/invitations'
import { RESERVE, remainingBudget, sentLast24h, TOTAL_DAILY_BUDGET } from '../services/email/budget'

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const { invitations, sends } = await loadState()
  const now = new Date()
  const due = pickDue(invitations, sends, now)
  const count = (step: number, status = 'sent') => sends.filter(send => send.step === step && send.status === status).length

  console.log(`\nEn la cola: ${invitations.length}`)
  console.log(`  ya se registraron: ${invitations.filter(inv => inv.user_id).length} · fuera por rebote o spam: ${invitations.filter(inv => inv.suppressed).length}`)
  console.log(`  primera invitación enviada: ${count(1)} (falló ${count(1, 'failed')}) · última enviada: ${count(2)} (falló ${count(2, 'failed')})`)
  console.log(`Toca hoy: ${due.step2.length} última + ${due.step1.length} primera`)
  console.log(`Tope de hoy por calentamiento: ${dailyCap(activeDaysBefore(sends, now))} · correos de las últimas 24 horas (todos los tipos): ${await sentLast24h(now)} de ${TOTAL_DAILY_BUDGET} · para invitaciones quedan ${await remainingBudget(now, RESERVE.invitations)}`)

  if (!process.argv.includes('--send')) { console.log('\n(Solo vista: no se envió nada. Usa --send para mandar la tanda de hoy.)'); return }
  const outcome = await runInvitationBatch(undefined, { limit: arg('--limit') ? Number(arg('--limit')) : undefined })
  console.log(outcome.status === 'skipped' ? `\nOmitido: ${outcome.reason}` : `\nEnviados ${outcome.sent} (primera ${outcome.step1}, última ${outcome.step2}) · fallidos ${outcome.failed} · en espera ${outcome.waiting}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

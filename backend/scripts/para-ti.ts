/**
 * "Para ti": ver a quién le tocaría cada correo y, si lo pides, mandarlos.
 *
 *   npm run para-ti                            quién recibiría la alerta y el resumen hoy (no envía ni avisa nada)
 *   npm run para-ti -- --send alerts           corre las alertas (avisos en la campana + correos con topes)
 *   npm run para-ti -- --send digest           corre el resumen semanal
 *
 * El proceso automático hace lo mismo: alertas todos los días 8:30 (MATCH_ALERTS=on) y resumen martes y miércoles 10:05
 * (MATCH_DIGEST=on). Solo se envía con --send y nunca sin el visto bueno del dueño.
 * Necesita backend/sql/notifications-migration.sql y RESEND_API_KEY.
 */
import 'dotenv/config'
import { remainingBudget, RESERVE, sentLast24h, TOTAL_DAILY_BUDGET } from '../services/email/budget'
import { ALERT_WINDOW_DAYS, loadHistory, loadMatchPeople, loadVacancies, planAlerts, planDigests, runAlertBatch, runDigestBatch } from '../services/email/para-ti-batch'
import { DIGEST_WINDOW_DAYS } from '../services/email/para-ti'

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const history = await loadHistory()
  if (!history) console.log('⚠ Falta aplicar backend/sql/notifications-migration.sql: sin él no se puede enviar (se repetirían los avisos).')
  const empty = { alerted: new Map(), emails: [] }
  const people = await loadMatchPeople()
  const now = new Date()

  const alerts = planAlerts(people, await loadVacancies(ALERT_WINDOW_DAYS), history ?? empty, now)
  const digests = planDigests(people, await loadVacancies(DIGEST_WINDOW_DAYS), history ?? empty, now)
  console.log(`\nPersonas con perfil completo: ${people.length}`)
  console.log(`Alertas (80 % o más, vacantes de los últimos ${ALERT_WINDOW_DAYS} días): ${alerts.length} avisos en la campana · ${alerts.filter(plan => plan.email).length} también por correo`)
  console.log(`Resumen semanal: ${digests.length} personas recibirían uno`)
  console.log(`Cupo de correos: ${await sentLast24h(now)} de ${TOTAL_DAILY_BUDGET} en las últimas 24 horas · quedan ${await remainingBudget(now)} (alertas usan ${await remainingBudget(now, RESERVE.alerts)}, resumen ${await remainingBudget(now, RESERVE.digest)})`)

  const target = arg('--send')
  if (!target) { console.log('\n(Solo vista: no se envió ni se avisó nada. Usa --send alerts o --send digest.)'); return }
  if (target !== 'alerts' && target !== 'digest') throw new Error('Usa --send alerts o --send digest')
  const outcome = target === 'alerts' ? await runAlertBatch() : await runDigestBatch()
  console.log(outcome.status === 'skipped' ? `\nOmitido: ${outcome.reason}` : `\nListo: ${JSON.stringify(outcome)}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

/**
 * Correos de bienvenida: ver a quién le tocarían y, si lo pides, mandarlos.
 *
 *   npm run welcome                                         a quién le tocaría (no envía nada)
 *   npm run welcome -- --send founders [--limit 5]          manda "gracias por ser de los primeros" a los que ya estaban
 *   npm run welcome -- --send new [--limit 5]               manda la bienvenida con pasos a las personas nuevas
 *
 * El proceso automático hace lo mismo: cada 15 minutos para las nuevas (WELCOME_EMAILS=on) y a las 12:00 de Monterrey
 * para los primeros miembros (WELCOME_FOUNDERS_EMAILS=on). Solo se envía con --send y nunca sin el visto bueno del dueño.
 * Necesita RESEND_API_KEY y backend/sql/email-reminders-migration.sql.
 */
import 'dotenv/config'
import { maskEmail } from '../services/email/profile-reminder'
import { remainingBudget } from '../services/email/budget'
import { WELCOME_CUTOFF, loadWelcomeCandidates, runWelcomeBatch, type WelcomeAudience } from '../services/email/welcome'

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const candidates = await loadWelcomeCandidates()
  console.log(`\nCorte: quien se registró antes del ${WELCOME_CUTOFF.toISOString().slice(0, 16).replace('T', ' ')} UTC es "primeros miembros"; después, "nuevo".`)
  if (!candidates.ready) console.log('⚠ Falta aplicar backend/sql/email-reminders-migration.sql: sin el registro de envíos no se puede enviar.')

  for (const [audience, label] of [['founders', 'Primeros miembros (con perfil completo)'], ['new', 'Personas nuevas (10 min a 7 días de registradas)']] as const) {
    const people = candidates[audience]
    console.log(`\n${label}: ${people.length}`)
    for (const user of people.slice(0, 60)) {
      console.log(`  ${(user.display_name || user.name || '(sin nombre)').padEnd(30)} ${maskEmail(user.email!).padEnd(28)} ${(user.provider || '-').padEnd(9)} ${user.created_at.slice(0, 16).replace('T', ' ')} ${user.profile_completed ? 'perfil completo' : 'perfil sin completar'}`)
    }
  }
  console.log(`\nCupo de correos que queda en estas 24 horas: ${await remainingBudget()}`)

  const target = arg('--send') as WelcomeAudience | undefined
  if (!target) { console.log('\n(Solo vista: no se envió nada. Usa --send founders o --send new.)'); return }
  if (target !== 'founders' && target !== 'new') throw new Error('Usa --send founders o --send new')

  const outcome = await runWelcomeBatch(target, undefined, { limit: arg('--limit') ? Number(arg('--limit')) : undefined })
  console.log(outcome.status === 'skipped' ? `\nOmitido: ${outcome.reason}` : `\nEnviados ${outcome.sent} · fallidos ${outcome.failed} · en espera ${outcome.waiting}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

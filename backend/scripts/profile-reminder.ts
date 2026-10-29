/**
 * Recordatorio "completa tu perfil": ver a quién le tocaría, probarlo y enviarlo.
 *
 *   npm run profile-reminder                                  ver a quién le llegaría y qué vacante iría (no envía nada)
 *   npm run profile-reminder -- --preview tu@correo.com       te manda UN correo igual al real, a ti
 *   npm run profile-reminder -- --send [--limit 20]           lo envía a las personas (solo si lo pides con --send)
 *   (cualquiera de los dos admite --include-recent: también a quien se registró hace menos de 24 h)
 *
 * Variables (del entorno o de backend/.env): RESEND_API_KEY y, si quieres, RESEND_FROM.
 * Para enviar necesita backend/sql/email-reminders-migration.sql aplicada (registro de envíos).
 */
import 'dotenv/config'
import { Resend } from 'resend'
import {
  MIN_ACCOUNT_AGE_HOURS,
  REMINDER_KIND,
  buildReminder,
  loadAudience,
  maskEmail,
  mailConfigFromEnv,
  pickPopularVacancy,
  sendReminders,
  type Exclusion,
} from '../services/email/profile-reminder'

const EXCLUSION_LABEL: Record<Exclusion, string> = {
  completo: 'ya completaron el perfil',
  'prueba-o-scraper': 'cuentas de prueba o del scraper',
  'equipo-o-empresa': 'equipo o empresas',
  'sin-correo': 'sin correo válido',
  'dio-de-baja': 'se dieron de baja',
  'muy-reciente': 'se registraron hace menos de 24 h',
  'ya-enviado': 'ya recibieron este correo',
}

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const has = (name: string): boolean => process.argv.includes(name)

async function main() {
  const preview = arg('--preview')
  const send = has('--send')
  const limit = arg('--limit') ? Number(arg('--limit')) : undefined

  // Por defecto no se escribe a quien se registró hace menos de 24 h (puede estar llenando el perfil); --include-recent lo permite.
  const audience = await loadAudience(REMINDER_KIND, new Date(), has('--include-recent') ? 0 : MIN_ACCOUNT_AGE_HOURS)
  const picked = await pickPopularVacancy()

  const rate = audience.realPeople ? Math.round((audience.completed / audience.realPeople) * 100) : 0
  console.log(`\nPersonas reales registradas: ${audience.realPeople} · con perfil completo: ${audience.completed} (${rate} %)`)
  console.log(`Recibirían el correo: ${audience.eligible.length}`)
  for (const [reason, count] of Object.entries(audience.excluded)) if (count > 0) console.log(`  - ${EXCLUSION_LABEL[reason as Exclusion]}: ${count}`)
  if (!audience.ready.log) console.log('\n⚠ Falta aplicar backend/sql/email-reminders-migration.sql en Supabase (registro de envíos): sin ella no se puede enviar.')

  if (!picked) { console.log('\nNo hay vacantes abiertas para destacar.'); return }
  console.log(`\nVacante que iría (${picked.vacancy.label}): ${picked.vacancy.title} — ${picked.vacancy.meta}`)
  console.log(`  puntaje de popularidad: ${picked.vacancy.score} · vacantes abiertas hoy: ${picked.openVacancies}`)

  console.log('\nQuiénes:')
  for (const user of audience.eligible.slice(0, limit ?? 200)) {
    console.log(`  ${(user.display_name || user.name || '(sin nombre)').padEnd(28)} @${(user.username || '-').padEnd(20)} ${maskEmail(user.email!).padEnd(28)} ${(user.provider || '-').padEnd(9)} ${user.created_at.slice(0, 16).replace('T', ' ')}`)
  }

  if (!preview && !send) { console.log('\n(Solo vista: no se envió nada. Usa --preview tu@correo.com para recibir uno tú.)'); return }

  const { config, missing } = mailConfigFromEnv()
  if (!config) { console.error(`\nFalta configurar: ${missing.join(', ')}`); process.exit(1) }

  if (preview) {
    // La vista previa nunca usa a una persona real: lleva el nombre que le des (por defecto Kevin).
    const email = buildReminder({ display_name: arg('--name') ?? 'Kevin', name: null, username: null }, picked)
    const { data, error } = await new Resend(config.apiKey).emails.send({ from: config.from, replyTo: config.replyTo, to: preview, subject: email.subject, html: email.html, text: email.text })
    if (error) { console.error(`\nResend rechazó el envío: ${error.name}: ${error.message}`); process.exit(1) }
    console.log(`\nVista previa enviada a ${preview} (id ${data?.id}). Es el mismo correo que recibiría la persona.`)
    return
  }

  if (!audience.ready.log) { console.error('\nNo se envía: falta aplicar la migración.'); process.exit(1) }
  const targets = audience.eligible.slice(0, limit)
  console.log(`\nEnviando a ${targets.length} persona(s)…`)
  const result = await sendReminders(targets, picked, config, REMINDER_KIND)
  console.log(`Enviados: ${result.sent} · fallidos: ${result.failed.length} · omitidos (ya tenían registro): ${result.skipped}`)
  for (const failure of result.failed) console.log(`  fallo ${failure.userId}: ${failure.error}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

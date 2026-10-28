/**
 * Te manda las dos invitaciones de prueba (la primera y la última) con las vacantes reales de hoy. No toca ninguna lista.
 *
 *   RESEND_API_KEY=re_... npm run invitation-preview -- tu@correo.com [nombre]
 *
 * La llave se lee solo del entorno: nunca se escribe en un archivo del repo.
 */
import 'dotenv/config'
import { Resend } from 'resend'
import { pickTopVacancies } from '../services/email/profile-reminder'
import { trackedLink } from '../services/email/links'
import { renderInvitation1, renderInvitation2 } from '../services/email/templates/invitation'

async function main() {
  const to = process.argv[2]
  const name = process.argv[3] || null
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY en el entorno')
  if (!to) throw new Error('Uso: npm run invitation-preview -- tu@correo.com [nombre]')

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'AvoTalent <no-reply@avotalent.app>'

  for (const step of [1, 2] as const) {
    const campaign = `invitacion-${step}`
    const { vacancies, openVacancies } = await pickTopVacancies(step === 1 ? 1 : 3, campaign, 'prueba', 'invitacion')
    const data = { name, signupUrl: trackedLink('/signup', campaign, 'prueba', 'invitacion'), openVacancies, vacancies }
    const email = step === 1 ? renderInvitation1(data) : renderInvitation2(data)
    const { data: sent, error } = await resend.emails.send({ from, to, subject: email.subject, html: email.html, text: email.text })
    if (error) throw new Error(`Resend rechazó la invitación ${step}: ${error.name}: ${error.message}`)
    console.log(`Invitación ${step} enviada (id ${sent?.id}): ${email.subject}`)
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

/**
 * Te manda las tres versiones del correo de bienvenida de prueba, con la vacante real más popular de hoy:
 *   1. persona nueva con el perfil SIN completar (el botón lleva al onboarding)
 *   2. persona nueva con el perfil completo (el botón lleva al feed)
 *   3. personas que ya estaban (agradecimiento + pedir opinión)
 * No toca ninguna lista ni anota nada en la base.
 *
 *   RESEND_API_KEY=re_... npm run welcome-preview -- tu@correo.com [nombre]
 */
import 'dotenv/config'
import { Resend } from 'resend'
import { DEFAULT_FROM, DEFAULT_REPLY_TO, pickTopVacancies } from '../services/email/profile-reminder'
import { trackedLink } from '../services/email/links'
import { renderFounders, renderWelcome } from '../services/email/templates/welcome'

async function main() {
  const to = process.argv[2]
  const name = process.argv[3] || null
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY en el entorno')
  if (!to) throw new Error('Uso: npm run welcome-preview -- tu@correo.com [nombre]')

  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || DEFAULT_FROM
  const replyTo = process.env.RESEND_REPLY_TO || DEFAULT_REPLY_TO

  const nuevos = await pickTopVacancies(1, 'bienvenida-nuevos', 'vacante-popular', 'bienvenida')
  const fundadores = await pickTopVacancies(1, 'bienvenida-fundadores', 'vacante-popular', 'bienvenida')
  const emails = [
    ['Bienvenida (perfil sin completar)', renderWelcome({ name, profileCompleted: false, ctaUrl: trackedLink('/onboarding', 'bienvenida-nuevos', 'boton', 'bienvenida'), vacancy: nuevos.vacancies[0] ?? null, openVacancies: nuevos.openVacancies })],
    ['Bienvenida (perfil completo)', renderWelcome({ name, profileCompleted: true, ctaUrl: trackedLink('/', 'bienvenida-nuevos', 'boton', 'bienvenida'), vacancy: nuevos.vacancies[0] ?? null, openVacancies: nuevos.openVacancies })],
    ['Primeros miembros', renderFounders({ name, ctaUrl: trackedLink('/', 'bienvenida-fundadores', 'boton', 'bienvenida'), vacancy: fundadores.vacancies[0] ?? null, openVacancies: fundadores.openVacancies })],
  ] as const

  for (const [label, email] of emails) {
    const { data, error } = await resend.emails.send({ from, replyTo, to, subject: email.subject, html: email.html, text: email.text })
    if (error) throw new Error(`Resend rechazó "${label}": ${error.name}: ${error.message}`)
    console.log(`${label} enviado (id ${data?.id}): ${email.subject}`)
    await new Promise(resolve => setTimeout(resolve, 600))
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

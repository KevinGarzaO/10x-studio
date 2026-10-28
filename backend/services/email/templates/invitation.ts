import type { RenderedEmail, ReminderVacancy } from './profile-reminder'

export interface InvitationData {
  /** Primer nombre, si se tiene. Sin nombre el saludo es "Hola". */
  name: string | null
  /** El enlace para crear la cuenta, ya marcado para medir el origen. */
  signupUrl: string
  /** Vacantes abiertas hoy en el sitio. */
  openVacancies: number
  /** La primera invitación usa la primera; la segunda usa las tres. */
  vacancies: ReminderVacancy[]
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const P = `margin: 0 0 16px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.6;`
const STRONG = `color: #111827 !important;`

const greeting = (name: string | null) => (name ? `Hola, <strong style="${STRONG}">${escapeHtml(name)}</strong> 👋` : 'Hola 👋')

function vacancyCard(vacancy: ReminderVacancy, tag: string): string {
  return `
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color: #ffffff !important; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px;">
                      <tr>
                        <td style="padding: 16px 18px;">
                          <span style="background-color: #d1fae5 !important; color: #047857 !important; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">${escapeHtml(tag)}</span>
                          <a href="${escapeHtml(vacancy.url)}" target="_blank" style="font-size: 16px; font-weight: 700; color: #0f172a !important; text-decoration: none; display: block; margin-top: 8px;">${escapeHtml(vacancy.title)}</a>
                          <span style="font-size: 13px; color: #64748b !important; display: block; margin-top: 3px;">${escapeHtml(vacancy.meta)}</span>
                        </td>
                      </tr>
                    </table>`
}

const button = (url: string, label: string) => `
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 6px auto 8px auto;">
                      <tr>
                        <td align="center" bgcolor="#00a86b" style="border-radius: 8px; background-color: #00a86b !important;">
                          <a href="${escapeHtml(url)}" target="_blank" style="font-size: 15px; font-weight: 700; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; border: 1px solid #00a86b; display: inline-block;">${label}</a>
                        </td>
                      </tr>
                    </table>`

function shell(subject: string, preheader: string, body: string, footer: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="es">
  <head>
    <meta content="width=device-width, initial-scale=1.0" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta name="color-scheme" content="only light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body dir="ltr" lang="es" style="margin: 0; padding: 0; background-color: #f3f4f6 !important; font-family: ${FONT}; -webkit-font-smoothing: antialiased;">
    <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;" data-skip-in-text="true">${escapeHtml(preheader)}</div>
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="background-color: #f3f4f6; padding: 30px 10px;">
      <tbody>
        <tr>
          <td align="center">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="max-width: 580px; background-color: #ffffff !important; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
              <tbody>
                <tr>
                  <td bgcolor="#0b131e" style="background-color: #0b131e !important; padding: 20px 30px; text-align: left;">
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="vertical-align: middle;"><img src="https://avotalent.app/avotalent-logo.png" alt="AvoTalent" width="36" height="36" style="border-radius: 8px; display: block; border: 0;" /></td>
                        <td style="padding-left: 12px; vertical-align: middle;"><span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; font-family: ${FONT};"><span style="color: #ffffff !important;">Avo</span><span style="color: #00a86b !important;">Talent</span></span></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 35px 30px 20px 30px; background-color: #ffffff !important;">${body}
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#f8fafc" style="background-color: #f8fafc !important; padding: 20px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #9ca3af !important; line-height: 1.5;">${footer}</p>
                    <p style="margin: 0; font-size: 12px; color: #9ca3af !important;">© 2026 AvoTalent. Todos los derechos reservados.</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
`
}

const FOOTER_1 = 'Te escribimos porque tu correo está en nuestra lista de contactos. Solo te enviaremos 2 invitaciones.'
const FOOTER_2 = 'Esta es la última invitación: no te escribiremos más.'

export const INVITATION_SUBJECTS = {
  1: (openVacancies: number) => `Hay ${openVacancies.toLocaleString('es-MX')} vacantes tech abiertas hoy. ¿Cuáles encajan contigo?`,
  2: () => 'Última invitación: las 3 vacantes que más están interesando hoy',
} as const

/** Primera invitación: qué es AvoTalent y por qué vale la pena entrar. */
export function renderInvitation1(data: InvitationData): RenderedEmail {
  const { name, signupUrl, openVacancies, vacancies } = data
  const subject = INVITATION_SUBJECTS[1](openVacancies)
  const popular = vacancies[0]

  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">Encuentra tu próxima vacante tech, empezando por las que más encajan contigo</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}"><strong style="${STRONG}">AvoTalent</strong> es una comunidad para quienes trabajan en tecnología en LatAm. Reunimos las vacantes tech abiertas y, en cuanto nos dices qué haces y qué sabes, te mostramos <strong style="${STRONG}">primero las que más encajan contigo</strong>.</p>
                    ${popular ? vacancyCard(popular, 'La vacante más popular ahora') : ''}
                    <p style="margin: 8px 0 10px 0; font-size: 15px; color: #111827 !important; font-weight: 700;">Lo que encuentras adentro:</p>
                    <ul style="margin: 0 0 22px 0; padding: 0 0 0 20px; font-size: 15px; color: #4b5563 !important; line-height: 1.7;">
                      <li><strong style="${STRONG}">${openVacancies.toLocaleString('es-MX')} vacantes abiertas</strong> de empresas tech, ordenadas por puesto y skill.</li>
                      <li><strong style="${STRONG}">Tu compatibilidad</strong> con cada vacante, según tu puesto, tus skills, tu nivel y cómo prefieres trabajar.</li>
                      <li><strong style="${STRONG}">Una comunidad</strong> donde puedes publicar, comentar y votar sobre tecnología y carrera.</li>
                      <li><strong style="${STRONG}">Es gratis</strong> y entras con LinkedIn, GitHub o tu correo en un par de minutos.</li>
                    </ul>
                    ${button(signupUrl, 'Crear mi cuenta gratis →')}`

  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    'AvoTalent es una comunidad para quienes trabajan en tecnología en LatAm. Reunimos las vacantes tech abiertas y, en cuanto nos dices qué haces y qué sabes, te mostramos primero las que más encajan contigo.',
    '',
    popular ? `La vacante más popular ahora: ${popular.title} (${popular.meta})\n${popular.url}\n` : '',
    `- ${openVacancies} vacantes abiertas de empresas tech, ordenadas por puesto y skill.`,
    '- Tu compatibilidad con cada vacante, según tu puesto, tus skills, tu nivel y cómo prefieres trabajar.',
    '- Una comunidad donde puedes publicar, comentar y votar sobre tecnología y carrera.',
    '- Es gratis y entras con LinkedIn, GitHub o tu correo en un par de minutos.',
    '',
    `Crea tu cuenta gratis: ${signupUrl}`,
    '',
    FOOTER_1,
  ].join('\n')

  return { subject, html: shell(subject, 'Vacantes tech abiertas, ordenadas por lo que más encaja contigo. Gratis.', body, FOOTER_1), text }
}

/** Segunda y última invitación: más concreta (tres vacantes reales, cómo funciona en 3 pasos) y cierra con honestidad. */
export function renderInvitation2(data: InvitationData): RenderedEmail {
  const { name, signupUrl, openVacancies, vacancies } = data
  const subject = INVITATION_SUBJECTS[2]()
  const top = vacancies.slice(0, 3)

  const steps = [
    ['Crea tu cuenta', 'con LinkedIn, GitHub o tu correo.'],
    ['Elige tu puesto y tus skills', 'son las tecnologías que sabes usar (React, Python, SQL…).'],
    ['Mira tu compatibilidad', 'con cada vacante, empezando por las que más encajan.'],
  ]
    .map(([title, detail], index) => `
                      <tr>
                        <td valign="top" style="padding: 0 12px 12px 0; width: 28px;"><span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 12px; background-color: #00a86b !important; color: #ffffff !important; font-size: 13px; font-weight: 700;">${index + 1}</span></td>
                        <td valign="top" style="padding: 0 0 12px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.5;"><strong style="${STRONG}">${title}</strong> ${detail}</td>
                      </tr>`)
    .join('')

  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">Esto es lo que más está interesando hoy en AvoTalent</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">Hace unos días te invitamos a AvoTalent. Como esta es la <strong style="${STRONG}">última vez que te escribimos</strong>, mejor te dejamos lo más útil: las vacantes que más personas están viendo y guardando ahora, de entre las ${openVacancies.toLocaleString('es-MX')} que hay abiertas.</p>
                    ${top.map((vacancy, index) => vacancyCard(vacancy, `Top ${index + 1} del momento`)).join('')}
                    <p style="margin: 18px 0 10px 0; font-size: 15px; color: #111827 !important; font-weight: 700;">Así funciona (2 minutos):</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 14px 0;">${steps}
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ecfdf5" style="background-color: #ecfdf5 !important; border-radius: 10px; margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 14px 18px; font-size: 14px; color: #065f46 !important; line-height: 1.7;">Tu compatibilidad pesa <strong>35 %</strong> tu puesto, <strong>35 %</strong> tus skills, <strong>15 %</strong> tu nivel y <strong>15 %</strong> remoto, híbrido o presencial. Así sabes dónde sí tienes posibilidades antes de postularte.</td>
                      </tr>
                    </table>
                    <p style="${P}">Además puedes guardar vacantes, y publicar y comentar en la comunidad. Todo gratis.</p>
                    ${button(signupUrl, 'Crear mi cuenta gratis →')}
                    <p style="margin: 14px 0 0 0; font-size: 14px; color: #6b7280 !important; line-height: 1.6; text-align: center;">Si AvoTalent no es para ti, no pasa nada: no te escribiremos más.</p>`

  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    `Hace unos días te invitamos a AvoTalent. Como esta es la última vez que te escribimos, te dejamos lo más útil: las vacantes que más están interesando hoy, de entre las ${openVacancies} abiertas.`,
    '',
    ...top.map((vacancy, index) => `${index + 1}. ${vacancy.title} (${vacancy.meta})\n   ${vacancy.url}`),
    '',
    'Así funciona (2 minutos): 1) crea tu cuenta con LinkedIn, GitHub o tu correo; 2) elige tu puesto y tus skills; 3) mira tu compatibilidad con cada vacante, empezando por las que más encajan.',
    'La compatibilidad pesa: 35 % tu puesto, 35 % tus skills, 15 % tu nivel y 15 % remoto, híbrido o presencial.',
    '',
    `Crea tu cuenta gratis: ${signupUrl}`,
    '',
    'Si AvoTalent no es para ti, no pasa nada: no te escribiremos más.',
    FOOTER_2,
  ].join('\n')

  return { subject, html: shell(subject, 'Las 3 vacantes que más están interesando hoy y cómo ver cuáles encajan contigo.', body, FOOTER_2), text }
}

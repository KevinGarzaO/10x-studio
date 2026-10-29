import { P, STRONG, button, escapeHtml, greeting, shell, vacancyCard } from './invitation'
import type { ReminderVacancy, RenderedEmail } from './profile-reminder'

export interface WelcomeData {
  /** Primer nombre, si se tiene. Sin nombre el saludo es "Hola". */
  name: string | null
  /** Si ya completó su perfil: cambia los pasos y el botón. */
  profileCompleted: boolean
  /** Adonde lleva el botón: el onboarding si falta el perfil, el feed si ya está. */
  ctaUrl: string
  /** La vacante más popular del momento, con su enlace marcado. */
  vacancy: ReminderVacancy | null
  /** Vacantes abiertas hoy en el sitio. */
  openVacancies: number
}

const FOOTER = 'Recibes este correo porque creaste una cuenta en AvoTalent. Si tienes dudas, responde este correo: lo leemos.'

export const WELCOME_SUBJECT = (name: string | null) => (name ? `Bienvenido a AvoTalent, ${name}` : 'Bienvenido a AvoTalent')
export const FOUNDERS_SUBJECT = (name: string | null) => (name ? `${name}, gracias por ser de los primeros en AvoTalent` : 'Gracias por ser de los primeros en AvoTalent')

function steps(items: [string, string][]): string {
  const rows = items
    .map(([title, detail], index) => `
                      <tr>
                        <td valign="top" style="padding: 0 12px 12px 0; width: 28px;"><span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 12px; background-color: #00a86b !important; color: #ffffff !important; font-size: 13px; font-weight: 700;">${index + 1}</span></td>
                        <td valign="top" style="padding: 0 0 12px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.5;"><strong style="${STRONG}">${escapeHtml(title)}</strong> ${escapeHtml(detail)}</td>
                      </tr>`)
    .join('')
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 14px 0;">${rows}
                    </table>`
}

/** Bienvenida para quien acaba de crear su cuenta: qué es AvoTalent y qué hacer primero (distinto si ya completó el perfil). */
export function renderWelcome(data: WelcomeData): RenderedEmail {
  const { name, profileCompleted, ctaUrl, vacancy, openVacancies } = data
  const subject = WELCOME_SUBJECT(name)

  const items: [string, string][] = profileCompleted
    ? [
        ['Mira tu compatibilidad', 'con cada vacante en “Para ti”: te mostramos primero las que más encajan contigo.'],
        ['Guarda las que te interesen', 'y postúlate desde la página de cada vacante.'],
        ['Únete a la conversación', 'publica una discusión, comenta y vota en la comunidad.'],
      ]
    : [
        ['Completa tu perfil', 'con tu puesto, tu nivel, tus skills y cómo prefieres trabajar. Toma un par de minutos.'],
        ['Mira tu compatibilidad', 'con cada vacante en “Para ti”: te mostramos primero las que más encajan contigo.'],
        ['Guarda y participa', 'guarda vacantes, y publica o comenta en la comunidad.'],
      ]
  const cta = profileCompleted ? 'Ver mis vacantes →' : 'Completar mi perfil ahora →'
  const lead = profileCompleted
    ? `Tu perfil está listo y hay <strong style="${STRONG}">${openVacancies.toLocaleString('es-MX')} vacantes abiertas</strong>. Así sacas provecho a AvoTalent:`
    : `AvoTalent reúne las vacantes tech abiertas (hoy hay <strong style="${STRONG}">${openVacancies.toLocaleString('es-MX')}</strong>) y te muestra primero las que más encajan contigo. Para eso solo necesitamos conocerte un poco. Estos son tus primeros pasos:`

  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">Qué bueno tenerte en AvoTalent</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">${lead}</p>
                    ${steps(items)}
                    ${vacancy ? vacancyCard(vacancy, vacancy.label === 'popular' ? 'La vacante más popular ahora' : 'Vacante reciente') : ''}
                    ${button(ctaUrl, cta)}
                    <p style="margin: 14px 0 0 0; font-size: 14px; color: #6b7280 !important; line-height: 1.6; text-align: center;">¿Dudas o ideas? Responde este correo y te leemos.</p>`

  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    `Qué bueno tenerte en AvoTalent. ${profileCompleted ? `Tu perfil está listo y hay ${openVacancies} vacantes abiertas.` : `Reunimos las vacantes tech abiertas (hoy hay ${openVacancies}) y te mostramos primero las que más encajan contigo.`}`,
    '',
    ...items.map(([title, detail], index) => `${index + 1}. ${title} ${detail}`),
    '',
    vacancy ? `${vacancy.label === 'popular' ? 'La vacante más popular ahora' : 'Vacante reciente'}: ${vacancy.title} (${vacancy.meta})\n${vacancy.url}\n` : '',
    `${cta.replace(' →', '')}: ${ctaUrl}`,
    '',
    '¿Dudas o ideas? Responde este correo y te leemos.',
    FOOTER,
  ].join('\n')

  return { subject, html: shell(subject, 'Tus primeros pasos en AvoTalent y las vacantes que más encajan contigo.', body, FOOTER), text }
}

/** Para las personas que ya estaban antes del correo de bienvenida: agradece, cuenta qué hay y pide opinión. */
export function renderFounders(data: Pick<WelcomeData, 'name' | 'ctaUrl' | 'vacancy' | 'openVacancies'>): RenderedEmail {
  const { name, ctaUrl, vacancy, openVacancies } = data
  const subject = FOUNDERS_SUBJECT(name)

  const news: [string, string][] = [
    [`${openVacancies.toLocaleString('es-MX')} vacantes abiertas`, 'de empresas tech, ordenadas por puesto y skill.'],
    ['“Para ti”', 'te muestra primero las que más encajan con tu puesto, skills, nivel y modalidad.'],
    ['Comunidad', 'ya puedes publicar discusiones, comentar y votar.'],
    ['Exámenes de skill', 'para validar lo que sabes (por ahora, React).'],
  ]

  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">Gracias por ser de los primeros en AvoTalent</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">Te registraste cuando AvoTalent apenas arrancaba, y por eso queríamos darte las gracias de forma personal. Esto es lo que ya puedes hacer:</p>
                    <ul style="margin: 0 0 20px 0; padding: 0 0 0 20px; font-size: 15px; color: #4b5563 !important; line-height: 1.7;">
                      ${news.map(([title, detail]) => `<li><strong style="${STRONG}">${escapeHtml(title)}</strong> ${escapeHtml(detail)}</li>`).join('\n                      ')}
                    </ul>
                    ${vacancy ? vacancyCard(vacancy, vacancy.label === 'popular' ? 'La vacante más popular ahora' : 'Vacante reciente') : ''}
                    <p style="${P}">Y como todavía somos pocos, tu opinión pesa mucho: <strong style="${STRONG}">¿qué te gustaría encontrar en AvoTalent?</strong> Responde este correo y cuéntanos. Leemos todo.</p>
                    ${button(ctaUrl, 'Ver mis vacantes →')}`

  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    'Gracias por ser de los primeros en AvoTalent. Te registraste cuando apenas arrancaba y queríamos darte las gracias. Esto es lo que ya puedes hacer:',
    '',
    ...news.map(([title, detail]) => `- ${title} ${detail}`),
    '',
    vacancy ? `${vacancy.label === 'popular' ? 'La vacante más popular ahora' : 'Vacante reciente'}: ${vacancy.title} (${vacancy.meta})\n${vacancy.url}\n` : '',
    'Y como todavía somos pocos, tu opinión pesa mucho: ¿qué te gustaría encontrar en AvoTalent? Responde este correo y cuéntanos. Leemos todo.',
    '',
    `Ver mis vacantes: ${ctaUrl}`,
    '',
    FOOTER,
  ].join('\n')

  return { subject, html: shell(subject, 'Gracias por unirte desde el principio. Cuéntanos qué te gustaría ver.', body, FOOTER), text }
}

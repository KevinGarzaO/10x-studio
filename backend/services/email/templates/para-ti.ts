import { P, STRONG, button, escapeHtml, greeting, shell } from './invitation'
import type { RenderedEmail } from './profile-reminder'

export interface MatchItem {
  title: string
  /** Empresa • modalidad • nivel, ya armado. */
  meta: string
  /** Enlace a la vacante, ya marcado para medirlo. */
  url: string
  /** Compatibilidad, 0 a 100. */
  score: number
  /** Skills en común y skills que faltan, ya con su nombre para mostrar (React, no "react"). */
  shared: string[]
  missing: string[]
}

export interface DigestData {
  name: string | null
  items: MatchItem[]
  /** Adonde lleva "Ver todas mis vacantes". */
  seeAllUrl: string
}

export interface AlertData {
  name: string | null
  item: MatchItem
  seeAllUrl: string
}

const FOOTER_DIGEST = 'Recibes este correo porque completaste tu perfil en AvoTalent. Te enviamos como máximo un resumen por semana.'
const FOOTER_ALERT = 'Recibes este correo porque completaste tu perfil en AvoTalent. Te avisamos de una coincidencia fuerte como máximo una vez al día y tres por semana.'

export const DIGEST_SUBJECT = (count: number, name: string | null) =>
  `${count === 1 ? '1 vacante nueva que encaja' : `${count} vacantes nuevas que encajan`} contigo${name ? `, ${name}` : ''}`
export const ALERT_SUBJECT = (item: Pick<MatchItem, 'score' | 'title' | 'meta'>) => {
  const company = item.meta.split(' • ')[0]
  return `Nueva vacante con ${item.score} % de compatibilidad: ${item.title}${company ? ` en ${company}` : ''}`
}

/** El color de la compatibilidad: verde fuerte desde 80, verde normal desde 60, gris debajo. */
function badge(score: number): string {
  const [bg, fg] = score >= 80 ? ['#00a86b', '#ffffff'] : score >= 60 ? ['#d1fae5', '#047857'] : ['#e5e7eb', '#374151']
  return `<span style="background-color: ${bg} !important; color: ${fg} !important; font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 999px; display: inline-block; white-space: nowrap;">${score} %</span>`
}

function card(item: MatchItem): string {
  const shared = item.shared.length ? `<span style="color: #047857 !important;">✓ Coinciden:</span> ${escapeHtml(item.shared.join(', '))}` : ''
  const missing = item.missing.length ? `<br /><span style="color: #92400e !important;">Te falta:</span> ${escapeHtml(item.missing.slice(0, 3).join(', '))}` : ''
  return `
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color: #ffffff !important; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px;">
                      <tr>
                        <td style="padding: 16px 18px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td valign="top">
                                <a href="${escapeHtml(item.url)}" target="_blank" style="font-size: 16px; font-weight: 700; color: #0f172a !important; text-decoration: none; display: block;">${escapeHtml(item.title)}</a>
                                <span style="font-size: 13px; color: #64748b !important; display: block; margin-top: 3px;">${escapeHtml(item.meta)}</span>
                              </td>
                              <td valign="top" align="right" style="padding-left: 12px;">${badge(item.score)}</td>
                            </tr>
                          </table>
                          ${shared || missing ? `<p style="margin: 10px 0 0 0; font-size: 13px; color: #4b5563 !important; line-height: 1.6;">${shared}${missing}</p>` : ''}
                        </td>
                      </tr>
                    </table>`
}

const line = (item: MatchItem, index: number) => `${index + 1}. ${item.title} (${item.meta}) — ${item.score} %${item.shared.length ? ` · coinciden: ${item.shared.join(', ')}` : ''}${item.missing.length ? ` · te falta: ${item.missing.slice(0, 3).join(', ')}` : ''}\n   ${item.url}`

/** El resumen semanal: las vacantes nuevas que mejor encajan con la persona, con su porcentaje y qué skills coinciden o faltan. */
export function renderDigest(data: DigestData): RenderedEmail {
  const { name, items, seeAllUrl } = data
  const subject = DIGEST_SUBJECT(items.length, name)
  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">${items.length === 1 ? 'Esta vacante nueva encaja contigo' : `Estas ${items.length} vacantes nuevas encajan contigo`}</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">Revisamos las vacantes que se publicaron esta semana y comparamos cada una con <strong style="${STRONG}">tu puesto, tus skills, tu nivel y cómo prefieres trabajar</strong>. Estas son las que más encajan:</p>
                    ${items.map(card).join('')}
                    ${button(seeAllUrl, 'Ver todas mis vacantes →')}
                    <p style="margin: 14px 0 0 0; font-size: 14px; color: #6b7280 !important; line-height: 1.6; text-align: center;">El porcentaje es tu compatibilidad. Mientras más skills coincidan, más alto.</p>`
  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    `${items.length === 1 ? 'Esta vacante nueva encaja contigo' : `Estas ${items.length} vacantes nuevas encajan contigo`} (se publicaron esta semana y las comparamos con tu puesto, skills, nivel y modalidad):`,
    '',
    ...items.map(line),
    '',
    `Ver todas mis vacantes: ${seeAllUrl}`,
    '',
    FOOTER_DIGEST,
  ].join('\n')
  return { subject, html: shell(subject, 'Las vacantes nuevas que mejor encajan con tu perfil, con tu compatibilidad.', body, FOOTER_DIGEST), text }
}

/** La alerta de una coincidencia fuerte: una sola vacante, con todo el detalle de por qué encaja. */
export function renderAlert(data: AlertData): RenderedEmail {
  const { name, item, seeAllUrl } = data
  const subject = ALERT_SUBJECT(item)
  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">Una vacante nueva encaja ${item.score} % contigo</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">Acaba de publicarse una vacante con una <strong style="${STRONG}">compatibilidad muy alta</strong> con tu perfil. Las buenas se llenan rápido, por eso te avisamos hoy:</p>
                    ${card(item)}
                    ${button(item.url, 'Ver la vacante →')}
                    <p style="margin: 14px 0 0 0; font-size: 14px; color: #6b7280 !important; line-height: 1.6; text-align: center;"><a href="${escapeHtml(seeAllUrl)}" style="color: #6b7280 !important; text-decoration: underline;">Ver todas mis vacantes</a></p>`
  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    `Acaba de publicarse una vacante con ${item.score} % de compatibilidad con tu perfil. Las buenas se llenan rápido, por eso te avisamos hoy:`,
    '',
    line(item, 0).replace(/^1\. /, ''),
    '',
    `Todas mis vacantes: ${seeAllUrl}`,
    '',
    FOOTER_ALERT,
  ].join('\n')
  return { subject, html: shell(subject, `${item.title}: ${item.score} % de compatibilidad con tu perfil.`, body, FOOTER_ALERT), text }
}

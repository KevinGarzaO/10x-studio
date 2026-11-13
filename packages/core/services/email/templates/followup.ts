import { P, STRONG, button, escapeHtml, greeting, shell } from './invitation'
import type { RenderedEmail } from './profile-reminder'

export interface FollowupItem {
  title: string
  company: string | null
}

export interface FollowupData {
  name: string | null
  /** Hasta 3, la más antigua primero. */
  items: FollowupItem[]
  /** Cuántas más hay además de las que se muestran. */
  more: number
  /** Adonde lleva «Actualizar mis postulaciones», ya marcado para medirlo. */
  url: string
}

const FOOTER = 'Recibes este correo porque marcaste que te postulaste a una vacante desde AvoTalent. Te escribimos como máximo una vez por semana por esto. Puedes apagarlo en Ajustes > Notificaciones.'

export const FOLLOWUP_SUBJECT = (items: FollowupItem[], more: number): string => {
  const first = items[0]
  const label = `«${first.title.trim()}»${first.company ? ` en ${first.company.trim()}` : ''}`
  return items.length + more > 1 ? `¿Cómo van tus postulaciones? Empezando por ${label}` : `¿Cómo te fue con ${label}?`
}

const line = (item: FollowupItem) => `${item.title.trim()}${item.company ? ` — ${item.company.trim()}` : ''}`

/** «¿Cómo te fue con X?»: un recordatorio corto, con un solo botón a Mis postulaciones. Sin presionar y sin prometer nada. */
export function renderFollowup(data: FollowupData): RenderedEmail {
  const { name, items, more, url } = data
  const subject = FOLLOWUP_SUBJECT(items, more)
  const several = items.length + more > 1
  const list = items.map(item => `<li style="margin: 0 0 6px 0;"><strong style="${STRONG}">${escapeHtml(item.title.trim())}</strong>${item.company ? ` · ${escapeHtml(item.company.trim())}` : ''}</li>`).join('')
  const body = `
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">${several ? '¿Cómo van tus postulaciones?' : '¿Cómo te fue con tu postulación?'}</h1>
                    <p style="${P}">${greeting(name)}</p>
                    <p style="${P}">Hace unos días nos dijiste que te postulaste ${several ? 'a estas vacantes' : 'a esta vacante'}:</p>
                    <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; color: #4b5563 !important; line-height: 1.5;">${list}</ul>
                    ${more > 0 ? `<p style="${P}">Y ${more} más.</p>` : ''}
                    <p style="${P}">Si ya tuviste noticias (una entrevista, una oferta o un «por ahora no»), cuéntanos en <strong style="${STRONG}">Mis postulaciones</strong>: te toma un clic y así llevas tu búsqueda en un solo lugar.</p>
                    ${button(url, 'Actualizar mis postulaciones →')}`
  const text = [
    name ? `Hola, ${name}:` : 'Hola:',
    '',
    `Hace unos días nos dijiste que te postulaste ${several ? 'a estas vacantes' : 'a esta vacante'}:`,
    ...items.map(item => `- ${line(item)}`),
    ...(more > 0 ? [`... y ${more} más.`] : []),
    '',
    'Si ya tuviste noticias (una entrevista, una oferta o un «por ahora no»), cuéntanos en Mis postulaciones:',
    url,
    '',
    FOOTER,
  ].join('\n')
  return { subject, html: shell(subject, several ? 'Cuéntanos cómo van y llévalas en un solo lugar.' : 'Cuéntanos cómo te fue y llévala en un solo lugar.', body, FOOTER), text }
}

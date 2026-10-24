import { SITE_URL, type SeoVacancy } from './seo'

/**
 * El JSON-LD `JobPosting` que Google lee para mostrar la vacante en Google for Jobs.
 *
 * Solo dice lo que de verdad se sabe. Un dato inventado en datos estructurados es peor que
 * uno que falta: Google puede aplicar una acción manual al sitio entero. Por eso:
 *  - "remoto" sale solo si la vacante lo es; una presencial NO se publica como teletrabajo;
 *  - no se inventa el país, el tipo de empleo ni el salario;
 *  - `directApply` queda fuera: la postulación ocurre en el sitio de la empresa;
 *  - una vacante vencida no lleva JobPosting (la página sigue existiendo, pero ya no se
 *    ofrece como empleo abierto).
 */

/** Días que una vacante se considera abierta; el mismo plazo que usa el backend. */
export const VALID_DAYS = 45

const isRemote = (vacancy: SeoVacancy) => /^remot/i.test((vacancy.modalidad ?? '').trim()) || /^remot/i.test((vacancy.location ?? '').trim())

export function jobPostingSchema(vacancy: SeoVacancy): Record<string, unknown> | null {
  if (vacancy.expired) return null
  if (!vacancy.title || !vacancy.company || !vacancy.description || !vacancy.created_at) return null

  const posted = new Date(vacancy.created_at)
  if (Number.isNaN(posted.getTime())) return null

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: vacancy.title,
    description: vacancy.description,
    datePosted: posted.toISOString(),
    validThrough: new Date(posted.getTime() + VALID_DAYS * 86400000).toISOString(),
    identifier: { '@type': 'PropertyValue', name: vacancy.company, value: vacancy.slug },
    url: `${SITE_URL}/vacantes/${vacancy.slug}`,
    hiringOrganization: {
      '@type': 'Organization',
      name: vacancy.company,
      ...(vacancy.company_logo ? { logo: vacancy.company_logo } : {}),
    },
  }

  if (isRemote(vacancy)) {
    schema.jobLocationType = 'TELECOMMUTE'
  } else if (vacancy.location) {
    // Solo se conoce la ciudad o el país tal como lo escribió la oferta.
    schema.jobLocation = {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: vacancy.location.split(/[•;|]/)[0].trim() },
    }
  }

  return schema
}

/** El JSON-LD seguro para incrustar en un `<script>`: un `<` dentro del texto no puede cerrar la etiqueta. */
export function jsonLdString(schema: Record<string, unknown>): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c')
}

import { SITE_URL } from './seo'

/** La página de AvoTalent en LinkedIn: se enlaza en el pie del sitio, en las pantallas de registro y en los correos para que nos sigan. */
export const LINKEDIN_COMPANY_URL = 'https://www.linkedin.com/company/avotalent'

/**
 * Los datos de la organización para los buscadores (`Organization` de schema.org): con `sameAs` le dicen a Google que la página de
 * LinkedIn es la misma AvoTalent del sitio.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AvoTalent',
    url: SITE_URL,
    logo: `${SITE_URL}/avotalent-logo.png`,
    sameAs: [LINKEDIN_COMPANY_URL],
  }
}

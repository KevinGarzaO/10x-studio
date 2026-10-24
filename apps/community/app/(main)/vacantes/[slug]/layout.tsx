import type { Metadata } from 'next'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../../../lib/profile-options'
import { getSeoVacancy, SITE_URL } from '../../../../lib/seo'
import { jobPostingSchema, jsonLdString } from '../../../../lib/job-posting-schema'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface VacancyMeta {
  title?: string
  company?: string | null
  company_logo?: string | null
  role_category?: string | null
  seniority_level?: string | null
  location?: string | null
  modalidad?: string | null
  skills?: string[] | null
}

const known = (value: string | null | undefined): value is string => !!value && !/no especificado|unknown/i.test(value)

/**
 * Los metadatos de la página: lo que LinkedIn, WhatsApp y los buscadores muestran como
 * tarjeta cuando alguien comparte el enlace de una vacante.
 *
 * La página de la vacante es un componente de cliente, que no puede declarar metadatos;
 * por eso viven aquí, en el layout, que se renderiza en el servidor. Sin esto, la tarjeta
 * saldría vacía y nadie haría clic.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params

  let vacancy: VacancyMeta | null = null
  try {
    const res = await fetch(`${API_URL}/api/community/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 600 } })
    if (res.ok) vacancy = await res.json()
  } catch {
    // sin backend: se usan los metadatos generales del sitio
  }

  if (!vacancy?.title) return {}

  const company = vacancy.company?.trim()
  const title = company ? `${vacancy.title} — ${company}` : vacancy.title
  const facts = [
    ROLE_CATEGORY_LABELS[vacancy.role_category ?? ''],
    SENIORITY_LABELS[vacancy.seniority_level ?? ''],
    known(vacancy.location) ? vacancy.location : null,
    known(vacancy.modalidad) ? vacancy.modalidad : null,
  ].filter(Boolean)
  const skills = (vacancy.skills ?? []).slice(0, 5).join(', ')
  const description = [facts.join(' · '), skills ? `Skills: ${skills}` : null, 'Regístrate en AvoTalent y ve tu match.']
    .filter(Boolean)
    .join('. ')

  return {
    title,
    description,
    // Una sola dirección por vacante: sin esto, el mismo texto con otros parámetros (utm_...) cuenta como página aparte.
    alternates: { canonical: `${SITE_URL}/vacantes/${slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'AvoTalent',
      ...(vacancy.company_logo ? { images: [vacancy.company_logo] } : {}),
    },
    twitter: { card: 'summary', title, description },
  }
}

/**
 * Además de los metadatos, incrusta el JSON-LD `JobPosting` que Google usa para mostrar la
 * vacante en Google for Jobs (ver lib/job-posting-schema.ts). Una vacante vencida no lo lleva.
 */
export default async function VacancyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const vacancy = await getSeoVacancy(slug)
  const schema = vacancy ? jobPostingSchema(vacancy) : null

  return (
    <>
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />}
      {children}
    </>
  )
}

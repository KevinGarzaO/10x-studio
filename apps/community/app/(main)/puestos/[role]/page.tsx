import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getSeoRole, getSeoRoles, getSeoVacancies, SITE_URL } from '../../../../lib/seo'
import { jsonLdString } from '../../../../lib/job-posting-schema'
import { VacancyList } from '../../../../components/seo/vacancy-list'

interface PageProps {
  params: Promise<{ role: string }>
}

// Se arma al pedirse, no al compilar: si Vercel compilara antes de que el backend tenga estos
// datos, la página quedaría guardada vacía. Los datos sí se guardan una hora (ver lib/seo.ts).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { role: slug } = await params
  const [role, vacancies] = await Promise.all([getSeoRole(slug), getSeoVacancies({ role: slug, limit: 100 })])
  if (!role) return { title: 'Empleos | AvoTalent', robots: { index: false } }

  const count = vacancies.length
  const title = `Vacantes de ${role.label} | AvoTalent`
  const description =
    count > 0
      ? `${count} ${count === 1 ? 'vacante abierta' : 'vacantes abiertas'} de ${role.label}. Mira el nivel, la modalidad y los skills que piden, y descubre qué tan bien encajas.`
      : `Vacantes de ${role.label} en AvoTalent. Regístrate gratis para enterarte de las nuevas y ver qué tan bien encajas.`
  const url = `${SITE_URL}/puestos/${role.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    // Una página sin vacantes no aporta nada a un buscador: se deja fuera del índice hasta que tenga.
    robots: count > 0 ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: 'AvoTalent', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function RolePage({ params }: PageProps) {
  const { role: slug } = await params
  const role = await getSeoRole(slug)
  if (!role) notFound()

  const [vacancies, allRoles] = await Promise.all([getSeoVacancies({ role: role.slug, limit: 100 }), getSeoRoles()])
  // Sin vacantes de este puesto se ofrecen las más recientes, para que quien llegue no se quede sin nada.
  const fallback = vacancies.length === 0 ? await getSeoVacancies({ limit: 6 }) : []
  const others = allRoles.filter(other => other.slug !== role.slug).slice(0, 12)

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Puestos', item: `${SITE_URL}/puestos` },
      { '@type': 'ListItem', position: 3, name: role.label, item: `${SITE_URL}/puestos/${role.slug}` },
    ],
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-[#f3efe9]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumb) }} />

      <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-[#7d766c]">
        <Link href="/" className="hover:text-[#b3aba1]">Inicio</Link>
        <ChevronRight size={12} />
        <Link href="/puestos" className="hover:text-[#b3aba1]">Puestos</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-[#00A86B]">{role.label}</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight">Vacantes de {role.label}</h1>
      <p className="mt-3 max-w-2xl text-[#b3aba1]">
        {vacancies.length > 0
          ? `${vacancies.length} ${vacancies.length === 1 ? 'vacante abierta' : 'vacantes abiertas'} de ${role.label}. Regístrate gratis para ver qué tan bien encajas con cada una.`
          : `Por ahora no hay vacantes abiertas de ${role.label}. Estas son las más recientes.`}
      </p>

      <section className="mt-8">
        <VacancyList vacancies={vacancies.length > 0 ? vacancies : fallback} />
      </section>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#b3aba1]">Otros puestos</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map(other => (
              <li key={other.slug}>
                <Link
                  href={`/puestos/${other.slug}`}
                  className="inline-block rounded-lg border border-[#322f29] bg-[#221f1b] px-3 py-1.5 text-xs transition-colors hover:border-[#00A86B]"
                >
                  {other.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getSeoSkill, getSeoSkills, getSeoVacancies, SITE_URL } from '../../../../lib/seo'
import { jsonLdString } from '../../../../lib/job-posting-schema'
import { VacancyList } from '../../../../components/seo/vacancy-list'

interface PageProps {
  params: Promise<{ skill: string }>
}

// Se arma al pedirse, no al compilar: si Vercel compilara antes de que el backend tenga estos
// datos, la página quedaría guardada vacía. Los datos sí se guardan una hora (ver lib/seo.ts).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { skill: name } = await params
  const [skill, vacancies] = await Promise.all([getSeoSkill(name), getSeoVacancies({ skill: name, limit: 100 })])
  if (!skill) return { title: 'Empleos | AvoTalent', robots: { index: false } }

  const count = vacancies.length
  const title = `Vacantes de ${skill.label} | AvoTalent`
  const description =
    count > 0
      ? `${count} ${count === 1 ? 'vacante abierta' : 'vacantes abiertas'} que piden ${skill.label}. Mira el puesto, el nivel y la modalidad, y descubre qué tan bien encajas con tus skills.`
      : `Vacantes que piden ${skill.label} en AvoTalent. Regístrate gratis para enterarte de las nuevas y ver qué tan bien encajas.`
  const url = `${SITE_URL}/empleos/${encodeURIComponent(skill.name)}`

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

export default async function SkillPage({ params }: PageProps) {
  const { skill: name } = await params
  const skill = await getSeoSkill(name)
  if (!skill) notFound()

  const [vacancies, allSkills] = await Promise.all([getSeoVacancies({ skill: skill.name, limit: 100 }), getSeoSkills()])
  // Sin vacantes de este skill se ofrecen las más recientes, para que quien llegue no se quede sin nada.
  const fallback = vacancies.length === 0 ? await getSeoVacancies({ limit: 6 }) : []
  const others = allSkills.filter(other => other.name !== skill.name).slice(0, 12)

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Empleos', item: `${SITE_URL}/empleos` },
      { '@type': 'ListItem', position: 3, name: skill.label, item: `${SITE_URL}/empleos/${encodeURIComponent(skill.name)}` },
    ],
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-[color:var(--text)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumb) }} />

      <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-[color:var(--text-faint)]">
        <Link href="/" className="hover:text-[color:var(--text-muted)]">Inicio</Link>
        <ChevronRight size={12} />
        <Link href="/empleos" className="hover:text-[color:var(--text-muted)]">Empleos</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-[color:var(--brand)]">{skill.label}</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight">Vacantes de {skill.label}</h1>
      <p className="mt-3 max-w-2xl text-[color:var(--text-muted)]">
        {vacancies.length > 0
          ? `${vacancies.length} ${vacancies.length === 1 ? 'vacante abierta' : 'vacantes abiertas'} que piden ${skill.label}. Regístrate gratis para ver qué tan bien encajas con cada una.`
          : `Por ahora no hay vacantes abiertas que pidan ${skill.label}. Estas son las más recientes.`}
      </p>

      <section className="mt-8">
        <VacancyList vacancies={vacancies.length > 0 ? vacancies : fallback} />
      </section>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Otros skills</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map(other => (
              <li key={other.name}>
                <Link
                  href={`/empleos/${encodeURIComponent(other.name)}`}
                  className="inline-block rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs transition-colors hover:border-[color:var(--brand)]"
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

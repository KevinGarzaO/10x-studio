import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSeoSkills, getSeoVacancies, SITE_URL } from '../../../lib/seo'
import { VacancyList } from '../../../components/seo/vacancy-list'

// Se arma al pedirse, no al compilar: si Vercel compilara antes de que el backend tenga estos
// datos, la página quedaría guardada vacía. Los datos sí se guardan una hora (ver lib/seo.ts).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Empleos en tecnología por skill | AvoTalent',
  description:
    'Explora las vacantes publicadas en AvoTalent por skill: desarrollo, datos, diseño, marketing, ventas y más. Mira el puesto, el nivel y la modalidad, y descubre qué tan bien encajas.',
  alternates: { canonical: `${SITE_URL}/empleos` },
}

export default async function EmpleosPage() {
  const [skills, latest] = await Promise.all([getSeoSkills(), getSeoVacancies({ limit: 20 })])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-[color:var(--text)]">
      <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-[color:var(--text-faint)]">
        <Link href="/" className="hover:text-[color:var(--text-muted)]">Inicio</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-[color:var(--brand)]">Empleos</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight">Empleos por skill</h1>
      <p className="mt-3 max-w-2xl text-[color:var(--text-muted)]">
        Elige un skill y mira las vacantes abiertas que lo piden. Regístrate gratis para ver qué tan bien encajas con cada una.
      </p>

      {skills.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Skills con vacantes abiertas</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {skills.map(skill => (
              <li key={skill.name}>
                <Link
                  href={`/empleos/${encodeURIComponent(skill.name)}`}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3.5 text-xs transition-colors hover:border-[color:var(--brand)]"
                >
                  <span className="font-semibold">{skill.label}</span>
                  <span className="text-[color:var(--text-faint)]">{skill.vacancies}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Últimas vacantes</h2>
          <VacancyList vacancies={latest} />
        </section>
      )}
    </div>
  )
}

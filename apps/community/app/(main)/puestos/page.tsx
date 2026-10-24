import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSeoRoles, getSeoVacancies, SITE_URL } from '../../../lib/seo'
import { VacancyList } from '../../../components/seo/vacancy-list'

// Se arma al pedirse, no al compilar: si Vercel compilara antes de que el backend tenga estos
// datos, la página quedaría guardada vacía. Los datos sí se guardan una hora (ver lib/seo.ts).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Empleos por puesto: desarrollo, diseño, datos y más | AvoTalent',
  description:
    'Explora las vacantes de AvoTalent por puesto: backend, frontend, full stack, DevOps, UX/UI, datos y más. Mira el nivel y la modalidad, y descubre qué tan bien encajas.',
  alternates: { canonical: `${SITE_URL}/puestos` },
}

export default async function PuestosPage() {
  const [roles, latest] = await Promise.all([getSeoRoles(), getSeoVacancies({ limit: 20 })])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-[#f3efe9]">
      <nav aria-label="Migas de pan" className="mb-4 flex items-center gap-2 text-xs text-[#7d766c]">
        <Link href="/" className="hover:text-[#b3aba1]">Inicio</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-[#00A86B]">Puestos</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight">Empleos por puesto</h1>
      <p className="mt-3 max-w-2xl text-[#b3aba1]">
        Elige un puesto y mira las vacantes abiertas. Regístrate gratis para ver qué tan bien encajas con cada una.
      </p>

      {roles.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#b3aba1]">Puestos con vacantes abiertas</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {roles.map(role => (
              <li key={role.slug}>
                <Link
                  href={`/puestos/${role.slug}`}
                  className="flex items-center justify-between rounded-xl border border-[#322f29] bg-[#221f1b] p-3.5 text-xs transition-colors hover:border-[#00A86B]"
                >
                  <span className="font-semibold">{role.label}</span>
                  <span className="text-[#7d766c]">{role.vacancies}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#b3aba1]">Últimas vacantes</h2>
          <VacancyList vacancies={latest} />
        </section>
      )}
    </div>
  )
}

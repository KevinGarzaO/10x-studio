import Link from 'next/link'
import { Building, MapPin } from 'lucide-react'
import { ROLE_CATEGORY_LABELS, SENIORITY_LABELS } from '../../lib/profile-options'
import { formatCompanyName } from '../../lib/company'
import type { SeoVacancy } from '../../lib/seo'

const known = (value: string | null | undefined): value is string => !!value && !/no especificado|unknown/i.test(value)

function postedAgo(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

/**
 * Una lista de vacantes como enlaces rastreables: cada una es un `<a>` normal a su página, con
 * rol, nivel, modalidad y skills a la vista. Es lo que un buscador sigue para descubrir las vacantes.
 */
export function VacancyList({ vacancies }: { vacancies: SeoVacancy[] }) {
  return (
    <ul className="space-y-3">
      {vacancies.map(vacancy => {
        const role = ROLE_CATEGORY_LABELS[vacancy.role_category ?? '']
        const level = SENIORITY_LABELS[vacancy.seniority_level ?? '']
        const company = formatCompanyName(vacancy.company)
        const facts = [role, level, known(vacancy.modalidad) ? vacancy.modalidad : null].filter(Boolean)

        return (
          <li key={vacancy.id}>
            <Link
              href={`/vacantes/${vacancy.slug}`}
              className="block rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5 transition-colors hover:border-[color:var(--brand)]/60"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-muted)]">
                {company && <span className="inline-flex items-center gap-1 font-semibold"><Building size={13} /> {company}</span>}
                {known(vacancy.location) && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {vacancy.location!.split(/[•;|]/)[0].trim()}</span>}
                <span>{postedAgo(vacancy.created_at)}</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-[color:var(--text)]">{vacancy.title}</h3>
              {facts.length > 0 && <p className="mt-1 text-xs text-[color:var(--text-muted)]">{facts.join(' · ')}</p>}
              {vacancy.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {vacancy.skills.slice(0, 5).map(skill => (
                    <span key={skill} className="rounded-lg bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)]">{skill}</span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

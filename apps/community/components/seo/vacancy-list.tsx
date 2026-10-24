import Link from 'next/link'
import { Building } from 'lucide-react'
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
    <ul className="post-list">
      {vacancies.map(vacancy => {
        const role = ROLE_CATEGORY_LABELS[vacancy.role_category ?? '']
        const level = SENIORITY_LABELS[vacancy.seniority_level ?? '']
        const company = formatCompanyName(vacancy.company)
        const facts = [role, level, known(vacancy.modalidad) ? vacancy.modalidad : null].filter(Boolean)

        return (
          <li key={vacancy.id}>
            <Link href={`/vacantes/${vacancy.slug}`} className="post-card job-card block">
              <div className="jc-head">
                {company && <span className="jc-company"><Building size={14} /><span className="jc-company-name">{company}</span></span>}
                <span className="jc-time">{postedAgo(vacancy.created_at)}</span>
              </div>
              <h3 className="jc-title">{vacancy.title}</h3>
              {(facts.length > 0 || known(vacancy.location)) && (
                <p className="jc-facts">{[known(vacancy.location) ? vacancy.location!.split(/[•;|]/)[0].trim() : null, ...facts].filter(Boolean).join(' · ')}</p>
              )}
              {vacancy.skills.length > 0 && (
                <div className="jc-tags">
                  {vacancy.skills.slice(0, 5).map(skill => <span key={skill} className="jc-tag"><i>#</i>{skill}</span>)}
                </div>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

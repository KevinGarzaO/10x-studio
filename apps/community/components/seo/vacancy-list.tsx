import Link from 'next/link'
import { Building } from 'lucide-react'
import { formatCompanyName } from '../../lib/company'
import type { SeoVacancy } from '../../lib/seo'

function postedAgo(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

/**
 * Una lista de vacantes como enlaces rastreables: cada una es un `<a>` normal a su página. Sin cuenta solo
 * se muestran título, empresa y skills: el resto (lugar, nivel, modalidad, descripción) es para miembros. Es lo que un buscador sigue para descubrir las vacantes.
 */
export function VacancyList({ vacancies }: { vacancies: SeoVacancy[] }) {
  return (
    <ul className="post-list">
      {vacancies.map(vacancy => {
        const company = formatCompanyName(vacancy.company)

        return (
          <li key={vacancy.id}>
            <Link href={`/vacantes/${vacancy.slug}`} className="post-card job-card block">
              <div className="jc-head">
                {company && <span className="jc-company"><Building size={14} /><span className="jc-company-name">{company}</span></span>}
                <span className="jc-time">{postedAgo(vacancy.created_at)}</span>
              </div>
              <h3 className="jc-title">{vacancy.title}</h3>
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

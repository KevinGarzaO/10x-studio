'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { formatCompanyName, companySlug } from '../lib/company'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface HiringCompany {
  username: string
  name: string
  logo_url: string | null
}

// Shown only to logged-out visitors on the default feed view — the two
// things that actually differentiate AvoTalent (a real community + verified
// jobs from recognizable companies), in one glance. The trust-strip logos
// are fetched live (companies with an active job post right now), never a
// fixed hand-picked list, so it can't ever show a company that isn't really
// hiring today.
export function HeroBanner({ onViewJobs }: { onViewJobs: () => void }) {
  const [companies, setCompanies] = useState<HiringCompany[]>([])

  useEffect(() => {
    fetch(`${API_URL}/api/community/stats/companies?limit=6`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCompanies(d?.companies || []))
      .catch(() => {})
  }, [])

  return (
    <section className="hero-banner">
      <div className="hero-content">
        <h1>Conecta con la comunidad tech de LatAm y encuentra tu próxima vacante</h1>
        <p className="hero-subtitle">
          Discusiones reales entre developers, más vacantes verificadas directo de empresas
          {companies.length > 0 ? <> como {companies.slice(0, 3).map(c => formatCompanyName(c.name)).join(', ')}</> : null} — actualizadas todos los días.
        </p>
        <div className="hero-actions">
          <Link href="/signup" className="hero-btn-primary">Crear cuenta gratis</Link>
          <button type="button" className="hero-btn-secondary" onClick={onViewJobs}>
            Ver vacantes <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="hero-trust">
          <span className="hero-trust-label">Vacantes activas hoy de:</span>
          <div className="hero-trust-logos">
            {companies.map(c => (
              <Link key={c.username} href={`/empresas/${companySlug(c.username)}`} title={formatCompanyName(c.name)}>
                {c.logo_url ? <img className="trust-logo" src={c.logo_url} alt={formatCompanyName(c.name)} /> : <span className="trust-logo-fallback">{formatCompanyName(c.name)}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

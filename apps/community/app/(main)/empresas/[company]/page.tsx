'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, BriefcaseBusiness } from 'lucide-react'
import { CompanyAvatar, PostCard, type FeedPost } from '../../../../components/community-hub'
import { useShell } from '../../../../lib/shell-context'
import { companySlug, formatCompanyName } from '../../../../lib/company'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function CompanyProfilePage() {
  const { company } = useParams<{ company: string }>()
  const router = useRouter()
  const { requestAuth } = useShell()

  const [jobs, setJobs] = useState<FeedPost[] | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/community/posts?type=job&limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const all: FeedPost[] = d?.posts || []
        setJobs(all.filter(p => p.company && companySlug(p.company) === company))
      })
      .catch(() => setJobs([]))
  }, [company])

  const loading = jobs === null
  const companyName = formatCompanyName(jobs && jobs.length > 0 ? jobs[0].company : company)
  const logo = jobs?.find(j => j.company_logo)?.company_logo || null

  return (
    <div className="public-profile-wrap">
      <button onClick={() => router.back()} className="back-link"><ArrowLeft size={15} /> Volver al feed</button>
      <section className="public-profile-cover"><div className="cover-grid" /><div className="profile-cover-mark">&gt;_</div></section>
      <section className="public-profile-card public-profile-main">
        <div className="public-profile-head">
          <div className="public-profile-avatar-wrap">
            <CompanyAvatar company={companyName} logoUrl={logo} size={104} />
          </div>
          <div className="public-profile-title">
            <p className="page-kicker">Perfil de empresa</p>
            <h1>{companyName}</h1>
            <p className="muted">{jobs?.length || 0} vacante{jobs?.length === 1 ? '' : 's'} activa{jobs?.length === 1 ? '' : 's'}</p>
          </div>
        </div>
      </section>

      <section className="public-profile-card profile-activity">
        <div className="activity-heading">
          <div><p className="page-kicker">Vacantes</p><h2>Oportunidades en {companyName}</h2></div>
          <BriefcaseBusiness size={20} />
        </div>
        {loading ? (
          <p className="muted" style={{ padding: '20px 0' }}>Cargando vacantes...</p>
        ) : jobs.length > 0 ? (
          <div className="post-list" style={{ marginTop: 16 }}>
            {jobs.map(job => <PostCard key={job.id} post={job} onAuthRequired={requestAuth} activeTab="Vacantes & Freelance" />)}
          </div>
        ) : (
          <p className="muted" style={{ padding: '20px 0' }}>No hay vacantes activas de esta empresa por ahora.</p>
        )}
      </section>
    </div>
  )
}

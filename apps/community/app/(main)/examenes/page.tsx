'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SkillEligibilityList, type SkillEligibility } from '../../../components/exam/SkillEligibilityList'
import { fetchCurrentUser, getToken } from '../../../lib/session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function SkillExamsPage() {
  const router = useRouter()
  const [skills, setSkills] = useState<SkillEligibility[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchCurrentUser()
      .then(async (user) => {
        if (!user) {
          router.replace('/login')
          return
        }

        const res = await fetch(`${API_URL}/api/community/skill-exams/eligibility`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        if (!res.ok) throw new Error()

        const data = await res.json()
        if (!cancelled) setSkills(data.skills)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [router])

  if (error) {
    return (
      <div className="sxe-page">
        <h1 className="sxe-title">Validar mis skills</h1>
        <div className="sxe-card">
          <p className="sxe-blocked">Ocurrió un error, intenta de nuevo.</p>
        </div>
      </div>
    )
  }

  if (!skills) return null

  return (
    <div className="sxe-page">
      <h1 className="sxe-title">Validar mis skills</h1>
      <p className="sxe-subtitle">
        Presenta un examen para demostrar tu nivel. El resultado aparece en tu perfil, visible para las empresas.
      </p>
      <div className="sxe-card">
        <SkillEligibilityList skills={skills} />
      </div>
    </div>
  )
}

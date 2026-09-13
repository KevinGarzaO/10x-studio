'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExamQuestionForm, type ExamQuestionSubmitPayload } from '../../../../../components/admin/ExamQuestionForm'
import { fetchCurrentUser, getToken } from '../../../../../lib/session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function NewExamQuestionPage() {
  const router = useRouter()
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => {
        if (!user) {
          router.replace('/login')
          return
        }
        if (!user.roles?.includes('admin')) {
          router.replace('/')
          return
        }
        setIsAdmin(true)
      })
      .finally(() => setCheckingAccess(false))
  }, [router])

  async function handleSubmit(payload: ExamQuestionSubmitPayload) {
    try {
      const res = await fetch(`${API_URL}/api/admin/exam-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) return { ok: true as const }

      if (res.status === 400) {
        const data = await res.json()
        return { ok: false as const, field: data.field ?? null, message: data.message }
      }

      if (res.status === 401 || res.status === 403) {
        return { ok: false as const, field: null, message: 'No tienes permisos para esta acción' }
      }

      return { ok: false as const, field: null, message: 'Ocurrió un error, intenta de nuevo' }
    } catch {
      return { ok: false as const, field: null, message: 'Ocurrió un error, intenta de nuevo' }
    }
  }

  if (checkingAccess) return null
  if (!isAdmin) return null

  return (
    <div className="eqf-page">
      <h1 className="eqf-title">Nueva pregunta de examen</h1>
      <div className="eqf-card">
        <ExamQuestionForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}

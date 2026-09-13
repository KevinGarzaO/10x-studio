'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  SkillExamRunner,
  type AnswerResult,
  type ExamCompletedResult,
  type ExamQuestionView,
} from '../../../../components/exam/SkillExamRunner'
import { SkillExamResult } from '../../../../components/exam/SkillExamResult'
import { CANONICAL_SKILLS } from '../../../../lib/profile-options'
import { fetchCurrentUser, getToken } from '../../../../lib/session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ExamState {
  attemptId: string
  total: number
  answered: number
  question: ExamQuestionView
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
}

export default function SkillExamPage() {
  const router = useRouter()
  const params = useParams<{ skill: string }>()
  const skillName = params.skill

  const [exam, setExam] = useState<ExamState | null>(null)
  const [result, setResult] = useState<ExamCompletedResult | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const skillLabel = CANONICAL_SKILLS.find((s) => s.value === skillName)?.label ?? skillName

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const user = await fetchCurrentUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Si hay un examen abierto se retoma donde se quedó (FR-018); si no, se
      // inicia uno nuevo.
      const current = await fetch(`${API_URL}/api/community/skill-exams/current`, { headers: authHeaders() })

      if (current.ok) {
        const data = await current.json()
        if (data.skillName === skillName && data.question) {
          if (!cancelled) setExam({ attemptId: data.attemptId, total: data.total, answered: data.answered, question: data.question })
          return
        }
        if (data.skillName !== skillName) {
          if (!cancelled) setBlocked('Ya tienes otro examen en curso. Termínalo antes de empezar uno nuevo.')
          return
        }
      }

      const started = await fetch(`${API_URL}/api/community/skill-exams`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ skillName }),
      })
      const data = await started.json()

      if (!started.ok) {
        if (!cancelled) setBlocked(blockedMessage(started.status, data))
        return
      }

      if (!cancelled) setExam({ attemptId: data.attemptId, total: data.total, answered: data.answered, question: data.question })
    }

    boot()
      .catch(() => setBlocked('Ocurrió un error, intenta de nuevo'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [router, skillName])

  async function handleAnswer(position: number, selectedOptionIndex: number): Promise<AnswerResult | { error: string }> {
    try {
      const res = await fetch(`${API_URL}/api/community/skill-exams/${exam!.attemptId}/answers`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ position, selectedOptionIndex }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 410) return { error: 'Este examen venció. Podrás volver a presentarlo más adelante.' }
        return { error: data.message ?? 'Ocurrió un error, intenta de nuevo' }
      }
      return data
    } catch {
      return { error: 'Ocurrió un error, intenta de nuevo' }
    }
  }

  if (loading) return null

  if (blocked) {
    return (
      <div className="sxe-page">
        <h1 className="sxe-title">Examen de {skillLabel}</h1>
        <div className="sxe-card">
          <p className="sxe-blocked">{blocked}</p>
          <Link href="/examenes" className="sxe-link">
            Ver mis skills
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sxe-page">
      <h1 className="sxe-title">Examen de {skillLabel}</h1>
      <div className="sxe-card">
        {result ? (
          <SkillExamResult skillLabel={skillLabel} result={result} />
        ) : exam ? (
          <SkillExamRunner
            skillLabel={skillLabel}
            total={exam.total}
            initialAnswered={exam.answered}
            initialQuestion={exam.question}
            onAnswer={handleAnswer}
            onCompleted={setResult}
          />
        ) : null}
      </div>
    </div>
  )
}

function blockedMessage(status: number, data: { error?: string; retryAvailableAt?: string }) {
  if (status === 403) return 'Solo puedes presentar examen de un skill que tengas en tu perfil.'
  if (status === 422) return 'Este examen aún no está disponible: faltan preguntas en el banco.'
  if (status === 409 && data.error === 'exam_in_progress') {
    return 'Ya tienes otro examen en curso. Termínalo antes de empezar uno nuevo.'
  }
  if (status === 409 && data.error === 'waiting_period' && data.retryAvailableAt) {
    const date = new Date(data.retryAvailableAt).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return `Ya presentaste este examen. Podrás intentarlo de nuevo a partir del ${date}.`
  }
  return 'Ocurrió un error, intenta de nuevo'
}

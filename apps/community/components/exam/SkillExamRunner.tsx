'use client'

import { useState } from 'react'
import { submitAnswerSchema } from '@avocado/schemas'
import { Button } from '@/components/ui/button'

export interface ExamQuestionView {
  position: number
  text: string
  options: { index: number; text: string }[]
}

export interface ExamCompletedResult {
  completed: true
  level: string
  correctCount: number
  total: number
  profileLevel: string | null
  improved: boolean
  retryAvailableAt: string | null
}

export type AnswerResult =
  | { completed: false; answered: number; total: number; question: ExamQuestionView | null }
  | ExamCompletedResult

interface SkillExamRunnerProps {
  skillLabel: string
  total: number
  initialAnswered: number
  initialQuestion: ExamQuestionView
  onAnswer: (position: number, selectedOptionIndex: number) => Promise<AnswerResult | { error: string }>
  onCompleted: (result: ExamCompletedResult) => void
}

export function SkillExamRunner({
  skillLabel,
  total,
  initialAnswered,
  initialQuestion,
  onAnswer,
  onCompleted,
}: SkillExamRunnerProps) {
  const [question, setQuestion] = useState<ExamQuestionView>(initialQuestion)
  const [answered, setAnswered] = useState(initialAnswered)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (selected === null) {
      setError('Selecciona una respuesta para continuar')
      return
    }

    const payload = { position: question.position, selectedOptionIndex: selected }
    if (!submitAnswerSchema.safeParse(payload).success) {
      setError('Respuesta inválida')
      return
    }

    setSubmitting(true)
    try {
      const result = await onAnswer(payload.position, payload.selectedOptionIndex)

      if ('error' in result) {
        setError(result.error)
        return
      }

      if (result.completed) {
        onCompleted(result)
        return
      }

      // No hay vuelta atrás: se avanza a la siguiente y la anterior queda
      // definitiva (FR-006).
      setAnswered(result.answered)
      setSelected(null)
      if (result.question) setQuestion(result.question)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="sxe-runner" noValidate>
      <div className="sxe-progress">
        <span className="sxe-skill">{skillLabel}</span>
        <span className="sxe-count">
          Pregunta {answered + 1} de {total}
        </span>
      </div>

      <div className="sxe-bar" aria-hidden="true">
        <div className="sxe-bar-fill" style={{ width: `${(answered / total) * 100}%` }} />
      </div>

      <h2 className="sxe-question">{question.text}</h2>

      <div className="sxe-options" role="radiogroup" aria-label="Opciones de respuesta">
        {question.options.map((option) => (
          <label key={option.index} className={`sxe-option${selected === option.index ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={`question-${question.position}`}
              value={option.index}
              checked={selected === option.index}
              onChange={() => setSelected(option.index)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>

      {error && <p role="alert" className="sxe-error">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {answered + 1 === total ? 'Terminar examen' : 'Siguiente'}
      </Button>

      <p className="sxe-hint">Una vez que envías una respuesta no puedes cambiarla.</p>
    </form>
  )
}

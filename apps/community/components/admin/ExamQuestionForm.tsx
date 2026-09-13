'use client'

import { useState } from 'react'
import { buildExamQuestionSchema, DIFFICULTY_LEVELS, type DifficultyLevel } from '@avocado/schemas'
import { CANONICAL_SKILLS } from '@/lib/profile-options'
import { Button } from '@/components/ui/button'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 6

export interface ExamQuestionSubmitPayload {
  question: string
  skillName: string
  options: string[]
  correctAnswerIndex: number
  difficultyLevel: DifficultyLevel
}

interface ExamQuestionFormProps {
  onSubmit: (payload: ExamQuestionSubmitPayload) => Promise<{ ok: true } | { ok: false; field: string | null; message: string }>
}

const EMPTY_OPTIONS = ['', '']

function capitalizeFirst(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function hasDuplicateOptions(options: string[]) {
  const trimmed = options.map((o) => o.trim().toLowerCase()).filter(Boolean)
  return new Set(trimmed).size !== trimmed.length
}

export function ExamQuestionForm({ onSubmit }: ExamQuestionFormProps) {
  const [question, setQuestion] = useState('')
  const [questionError, setQuestionError] = useState<string | null>(null)
  const [skillName, setSkillName] = useState(CANONICAL_SKILLS[0]?.value ?? '')
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS)
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null)
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>('basico')
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const validOptions = options.filter((o) => o.trim().length > 0)
  const tooFewOptions = validOptions.length < MIN_OPTIONS
  const duplicateOptions = hasDuplicateOptions(options)
  const noCorrectAnswer = correctAnswerIndex === null

  // AC2's disabled state is live (tied to having <2 options); AC3/AC4 are
  // gated on an actual submit attempt per the ticket's own Given/When wording.
  const canSubmit = !tooFewOptions

  function handleQuestionBlur() {
    const trimmed = capitalizeFirst(question.trim())
    setQuestion(trimmed)
    setQuestionError(trimmed.length === 0 ? 'La pregunta es obligatoria' : null)
  }

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  function blurOption(index: number) {
    setOptions((prev) => prev.map((o, i) => (i === index ? o.trim() : o)))
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return
    setOptions((prev) => [...prev, ''])
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
    if (correctAnswerIndex === index) setCorrectAnswerIndex(null)
    else if (correctAnswerIndex !== null && correctAnswerIndex > index) {
      setCorrectAnswerIndex(correctAnswerIndex - 1)
    }
  }

  function resetForm() {
    setQuestion('')
    setQuestionError(null)
    setSkillName(CANONICAL_SKILLS[0]?.value ?? '')
    setOptions(EMPTY_OPTIONS)
    setCorrectAnswerIndex(null)
    setDifficultyLevel('basico')
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitAttempted(true)

    const trimmedQuestion = capitalizeFirst(question.trim())
    if (trimmedQuestion.length === 0) {
      setQuestionError('La pregunta es obligatoria')
      return
    }
    if (tooFewOptions) {
      setFormError('Se requieren al menos 2 opciones')
      return
    }
    if (noCorrectAnswer) {
      setFormError('Selecciona la respuesta correcta')
      return
    }
    if (duplicateOptions) {
      setFormError('Las opciones no pueden repetirse')
      return
    }

    const trimmedOptions = validOptions.map((o) => o.trim())
    const schema = buildExamQuestionSchema(CANONICAL_SKILLS.map((s) => s.value))
    const payload: ExamQuestionSubmitPayload = {
      question: trimmedQuestion,
      skillName,
      options: trimmedOptions,
      correctAnswerIndex: correctAnswerIndex as number,
      difficultyLevel,
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmit(payload)
      if (result.ok) {
        setConfirmation(true)
        resetForm()
      } else {
        // FR-011: keep captured data on failure — do not reset the form here.
        if (result.field === 'question') setQuestionError(result.message)
        else setFormError(result.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="eqf-form">
      {confirmation && (
        <p role="status" className="eqf-success">Pregunta guardada correctamente.</p>
      )}

      <div className="eqf-field">
        <label htmlFor="exam-question">Pregunta</label>
        <textarea
          id="exam-question"
          className="eqf-textarea"
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onBlur={handleQuestionBlur}
        />
        {questionError && <p role="alert" className="eqf-error">{questionError}</p>}
      </div>

      <div className="eqf-field">
        <label htmlFor="exam-skill">Skill</label>
        <select id="exam-skill" className="eqf-select" value={skillName} onChange={(e) => setSkillName(e.target.value)}>
          {CANONICAL_SKILLS.map((skill) => (
            <option key={skill.value} value={skill.value}>
              {skill.label}
            </option>
          ))}
        </select>
      </div>

      <div className="eqf-field">
        <label>Opciones de respuesta</label>
        <div className="eqf-options">
          {options.map((option, index) => (
            <div key={index} className="eqf-option-row">
              <input
                type="radio"
                name="correct-answer"
                aria-label={`Marcar opción ${index + 1} como correcta`}
                className="eqf-radio"
                checked={correctAnswerIndex === index}
                onChange={() => setCorrectAnswerIndex(index)}
              />
              <input
                aria-label={`Opción ${index + 1}`}
                className="eqf-option-input"
                placeholder={`Opción ${index + 1}`}
                maxLength={200}
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                onBlur={() => blurOption(index)}
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  className="eqf-remove-option"
                  onClick={() => removeOption(index)}
                  aria-label={`Quitar opción ${index + 1}`}
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < MAX_OPTIONS && (
          <button type="button" className="eqf-add-option" onClick={addOption}>
            + Agregar opción
          </button>
        )}
        {tooFewOptions && <p role="alert" className="eqf-error">Se requieren al menos 2 opciones</p>}
      </div>

      <div className="eqf-field">
        <label htmlFor="exam-difficulty">Dificultad</label>
        <select
          id="exam-difficulty"
          className="eqf-select"
          value={difficultyLevel}
          onChange={(e) => setDifficultyLevel(e.target.value as DifficultyLevel)}
        >
          {DIFFICULTY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      {formError && <p role="alert" className="eqf-error">{formError}</p>}

      <Button type="submit" disabled={!canSubmit || submitting}>
        Guardar pregunta
      </Button>
    </form>
  )
}

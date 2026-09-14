'use client'

import Link from 'next/link'
import type { ExamCompletedResult } from './SkillExamRunner'

const LEVEL_LABEL: Record<string, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SkillExamResult({
  skillLabel,
  result,
}: {
  skillLabel: string
  result: ExamCompletedResult
}) {
  const { level, correctCount, total, profileLevel, improved, retryAvailableAt } = result
  const retryDate = formatDate(retryAvailableAt)

  return (
    <div className="sxe-result">
      <p className="sxe-result-kicker">Examen de {skillLabel}</p>
      <h2 className="sxe-result-level">{LEVEL_LABEL[level] ?? level}</h2>
      <p className="sxe-result-score">
        {correctCount} de {total} respuestas correctas
      </p>

      {improved ? (
        <p className="sxe-result-note is-good">
          Este nivel ya es visible en tu perfil.
        </p>
      ) : (
        // Sin esto el candidato cree que bajó de nivel. El perfil conserva el
        // mejor resultado histórico (FR-021).
        <p className="sxe-result-note">
          Tu perfil conserva el nivel <strong>{LEVEL_LABEL[profileLevel ?? ''] ?? profileLevel}</strong>, que ya habías
          alcanzado antes. Este intento no lo modifica.
        </p>
      )}

      {retryDate && (
        <p className="sxe-result-retry">Podrás volver a presentar este examen a partir del {retryDate}.</p>
      )}

      <div className="sxe-result-actions">
        <Link href="/examenes" className="sxe-link">
          Ver mis skills
        </Link>
        <Link href="/profile" className="sxe-link">
          Ir a mi perfil
        </Link>
      </div>
    </div>
  )
}

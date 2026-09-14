'use client'

import Link from 'next/link'
import { BadgeCheck, Clock, Lock } from 'lucide-react'

export interface SkillEligibility {
  skillName: string
  label: string
  validatedLevel: string | null
  achievedAt: string | null
  canStart: boolean
  reason: 'waiting_period' | 'insufficient_bank' | 'exam_in_progress' | null
  retryAvailableAt: string | null
}

const LEVEL_LABEL: Record<string, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

function statusFor(skill: SkillEligibility) {
  if (skill.reason === 'insufficient_bank') {
    return { icon: <Lock size={12} />, text: 'Aún no disponible' }
  }
  if (skill.reason === 'waiting_period') {
    const date = formatDate(skill.retryAvailableAt)
    return { icon: <Clock size={12} />, text: date ? `Disponible el ${date}` : 'En periodo de espera' }
  }
  if (skill.reason === 'exam_in_progress') {
    return { icon: <Clock size={12} />, text: 'Tienes otro examen en curso' }
  }
  return null
}

export function SkillEligibilityList({ skills }: { skills: SkillEligibility[] }) {
  if (skills.length === 0) {
    return (
      <p className="sxe-empty">
        Aún no tienes skills en tu perfil. Agrégalos desde{' '}
        <Link href="/settings" className="sxe-link">
          tu configuración
        </Link>{' '}
        para poder validarlos.
      </p>
    )
  }

  return (
    <ul className="sxe-list">
      {skills.map((skill) => {
        const status = statusFor(skill)
        return (
          <li key={skill.skillName} className="sxe-list-item">
            <div className="sxe-list-main">
              <span className="sxe-list-skill">
                {skill.validatedLevel && <BadgeCheck size={13} className="sxe-validated-icon" />}
                {skill.label}
              </span>
              {skill.validatedLevel ? (
                <span className="sxe-list-level">
                  {LEVEL_LABEL[skill.validatedLevel] ?? skill.validatedLevel}
                </span>
              ) : (
                <span className="sxe-list-pending">Sin validar</span>
              )}
            </div>

            {skill.canStart ? (
              <Link href={`/examenes/${skill.skillName}`} className="sxe-start">
                {skill.validatedLevel ? 'Mejorar nivel' : 'Presentar examen'}
              </Link>
            ) : (
              <span className="sxe-list-status">
                {status?.icon}
                {status?.text}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

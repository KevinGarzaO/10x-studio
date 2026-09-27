'use client'

import { Clock3, Check, GitMerge, X } from 'lucide-react'

export interface SkillProposal {
  id: string
  text: string
  status: 'pending' | 'approved' | 'merged' | 'rejected'
  skill: { name: string; label: string } | null
  rejectionReason: string | null
}

/**
 * El estado de las propuestas de skills de esta persona (FR-018).
 *
 * Es el único lugar donde el candidato se entera de lo que decidió el
 * superadmin: mientras no exista el sistema de notificaciones ni la pantalla de
 * revisión en Avocado Studio, esas decisiones se toman en la base de datos y
 * aparecen aquí la próxima vez que abre sus skills.
 */
export function SkillProposalsList({
  proposals,
  onAddSkill,
}: {
  proposals: SkillProposal[]
  /** Agrega al perfil un skill ya aprobado que salió de una propuesta. */
  onAddSkill?: (skillName: string) => void
}) {
  if (proposals.length === 0) return null

  return (
    <div className="skill-proposals">
      <p className="skill-proposals-title">Skills que propusiste</p>
      <ul>
        {proposals.map(proposal => (
          <li key={proposal.id} className={`skill-proposal is-${proposal.status}`}>
            {proposal.status === 'pending' && (
              <>
                <Clock3 size={13} aria-hidden />
                <span>
                  <strong>{proposal.text}</strong> · en revisión
                </span>
              </>
            )}

            {proposal.status === 'approved' && proposal.skill && (
              <>
                <Check size={13} aria-hidden />
                <span>
                  <strong>{proposal.text}</strong> · aprobado como {proposal.skill.label}
                </span>
                {onAddSkill && (
                  <button type="button" onClick={() => onAddSkill(proposal.skill!.name)}>
                    Agregarlo
                  </button>
                )}
              </>
            )}

            {proposal.status === 'merged' && proposal.skill && (
              <>
                <GitMerge size={13} aria-hidden />
                <span>
                  <strong>{proposal.text}</strong> · ya existía como {proposal.skill.label}
                </span>
                {onAddSkill && (
                  <button type="button" onClick={() => onAddSkill(proposal.skill!.name)}>
                    Agregarlo
                  </button>
                )}
              </>
            )}

            {proposal.status === 'rejected' && (
              <>
                <X size={13} aria-hidden />
                <span>
                  <strong>{proposal.text}</strong> · no aprobado
                  {proposal.rejectionReason ? `: ${proposal.rejectionReason}` : ''}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

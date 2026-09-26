'use client'

import { useCallback, useEffect, useState } from 'react'
import { skillProposalSchema } from '@avocado/schemas'
import { getToken } from './session'
import type { SkillProposal } from '../components/skill-proposals-list'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface UseSkillProposals {
  proposals: SkillProposal[]
  /** Mensaje del último intento: qué pasó con lo que propuso. */
  message: string | null
  propose: (text: string) => Promise<void>
}

/**
 * Propone skills y muestra el estado de las propuestas de esta persona.
 *
 * El texto se valida antes de enviar con `skillProposalSchema`, el mismo schema
 * que usa el backend (principio I). El backend vuelve a validar: esto solo evita
 * un viaje para un texto que ya sabemos inválido.
 */
export function useSkillProposals(onResolvedSkill?: (skillName: string) => void): UseSkillProposals {
  const [proposals, setProposals] = useState<SkillProposal[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/community/skill-proposals/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setProposals(data.proposals || [])
    } catch {
      // Sin propuestas visibles: no es un flujo crítico, y el campo de skills
      // sigue funcionando.
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const propose = useCallback(
    async (text: string) => {
      const parsed = skillProposalSchema.safeParse({ text })
      if (!parsed.success) {
        setMessage(parsed.error.issues[0].message)
        return
      }

      const token = getToken()
      if (!token) return

      try {
        const res = await fetch(`${API_URL}/api/community/skill-proposals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(parsed.data),
        })
        const data = await res.json()

        if (res.status === 409 && data.error === 'skill_rejected') {
          setMessage(`«${text}» no fue aprobado: ${data.reason}`)
          return
        }
        if (res.status === 409 && data.error === 'proposal_limit') {
          setMessage(
            `Ya tienes ${data.limit} propuestas en revisión. Espera una decisión antes de proponer otra.`,
          )
          return
        }
        if (!res.ok) {
          setMessage(data.message || 'No pudimos registrar tu propuesta')
          return
        }

        if (data.outcome === 'resolved') {
          // Ya existía: se agrega directo, sin propuesta que esperar.
          setMessage(`«${text}» ya existe como ${data.skill.label}, lo agregamos a tu perfil`)
          onResolvedSkill?.(data.skill.name)
          return
        }

        setMessage(
          data.outcome === 'joined'
            ? `«${text}» ya estaba propuesto: te sumamos a esa solicitud`
            : `Propusimos «${text}». Te avisamos aquí cuando se revise.`,
        )
        await load()
      } catch {
        setMessage('Error de conexión al proponer el skill')
      }
    },
    [load, onResolvedSkill],
  )

  return { proposals, message, propose }
}

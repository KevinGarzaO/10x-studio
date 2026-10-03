'use client'

import { useCallback, useEffect, useState } from 'react'
import { getToken } from './session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/** Quien se registra elige si viene como candidato o como empresa. */
export const SIGNUP_INTENT_KEY = 'avocado_signup_intent'

export interface ClaimableCompany {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

export interface CompanyClaim {
  id: string
  companyName: string
  rfc: string
  companyUserId: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason: string | null
  createdAt: string
  documents: { kind: string; fileName: string }[]
}

/** El reclamo de esta persona, si tiene uno. */
export function useMyCompanyClaim() {
  const [claim, setClaim] = useState<CompanyClaim | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/community/company-claims/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setClaim(data.claim)
      }
    } catch {
      // Sin solicitud visible: el formulario sigue disponible.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { claim, loading, reload }
}

/** Empresas que el scraper ya creó y que nadie ha reclamado. */
export async function searchClaimableCompanies(query: string): Promise<ClaimableCompany[]> {
  const token = getToken()
  if (!token || query.trim().length < 2) return []

  try {
    const res = await fetch(
      `${API_URL}/api/community/company-claims/claimable?q=${encodeURIComponent(query.trim())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.companies || []
  } catch {
    return []
  }
}

export type SubmitClaimResult =
  | { ok: true; claim: CompanyClaim }
  | { ok: false; field: string | null; message: string }

export async function submitCompanyClaim(payload: unknown): Promise<SubmitClaimResult> {
  const token = getToken()
  if (!token) return { ok: false, field: null, message: 'Tu sesión expiró, vuelve a entrar' }

  try {
    const res = await fetch(`${API_URL}/api/community/company-claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!res.ok) {
      return {
        ok: false,
        field: data.field ?? null,
        message: data.message || 'No pudimos enviar tu solicitud',
      }
    }
    return { ok: true, claim: data.claim }
  } catch {
    return { ok: false, field: null, message: 'Error de conexión al enviar tu solicitud' }
  }
}

/** Lee un archivo del input como data URL, para enviarlo al backend. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

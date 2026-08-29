'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { RedactorSection } from '@/components/redactor/RedactorSection'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function RedactorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  let prefill = null

  const title = searchParams.get('title')
  const notes = searchParams.get('notes')
  if (title) {
    prefill = { title, notes: notes || '' }
  } else if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('redactorPrefill')
    if (stored) {
      try {
        prefill = JSON.parse(stored)
        sessionStorage.removeItem('redactorPrefill')
      } catch {}
    }
  }

  const onNav = (section: string) => {
    const routeMap: Record<string, string> = {
      'li-dash': '/linkedin',
      'substack-dash': '/substack',
    }
    router.push(routeMap[section] || '/dashboard')
  }

  return <RedactorSection prefill={prefill} onNav={onNav} />
}

export default function RedactorPage() {
  return (
    <DashboardLayout>
      <Suspense>
        <RedactorContent />
      </Suspense>
    </DashboardLayout>
  )
}

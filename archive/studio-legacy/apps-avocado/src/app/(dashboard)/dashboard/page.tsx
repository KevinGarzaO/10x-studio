'use client'

import { Dashboard } from '@/components/dashboard/Dashboard'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const navTo = (section: string) => {
    const routeMap: Record<string, string> = {
      'redactor-new': '/redactor',
      'calendar': '/calendar',
      'topics': '/topics',
      'redactor': '/redactor',
    }
    router.push(routeMap[section] || '/dashboard')
  }

  return <Dashboard onNav={navTo as any} />
}

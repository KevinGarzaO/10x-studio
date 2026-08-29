'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { TopicsSection } from '@/components/topics/TopicsSection'
import { useRouter } from 'next/navigation'

export default function TopicsPage() {
  const router = useRouter()
  return (
    <DashboardLayout>
      <TopicsSection
        onWriteTopic={(t) => {
          sessionStorage.setItem('redactorPrefill', JSON.stringify(t))
          router.push('/redactor')
        }}
      />
    </DashboardLayout>
  )
}

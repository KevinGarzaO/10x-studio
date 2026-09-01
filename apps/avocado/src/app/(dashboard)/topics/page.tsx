'use client'

import { TopicsSection } from '@/components/topics/TopicsSection'
import { useRouter } from 'next/navigation'

export default function TopicsPage() {
  const router = useRouter()
  return (
    <TopicsSection
      onWriteTopic={(t) => {
        sessionStorage.setItem('redactorPrefill', JSON.stringify(t))
        router.push('/redactor')
      }}
    />
  )
}

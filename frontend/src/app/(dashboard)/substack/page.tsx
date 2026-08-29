'use client'

import { SubstackArticles } from '@/components/substack/SubstackArticles'
import { useRouter } from 'next/navigation'

export default function SubstackArticlesPage() {
  const router = useRouter()

  return (
    <SubstackArticles
      onCompose={() => router.push('/substack/publish')}
    />
  )
}

'use client'

import { SubstackPostDetail } from '@/components/substack/SubstackPostDetail'
import { useParams, useRouter } from 'next/navigation'

export default function SubstackPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.postId as string

  return (
    <SubstackPostDetail
      postId={postId}
      onBack={() => router.push('/substack')}
    />
  )
}

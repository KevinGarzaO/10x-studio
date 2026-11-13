'use client'

import { WebPostDetail } from '@/components/web/WebPostDetail'
import { useParams, useRouter } from 'next/navigation'

export default function WebPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.postId as string

  return (
    <WebPostDetail
      postId={postId}
      onBack={() => router.push('/web')}
    />
  )
}

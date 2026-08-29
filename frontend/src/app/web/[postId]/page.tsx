'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { WebPostDetail } from '@/components/web/WebPostDetail'
import { useParams, useRouter } from 'next/navigation'

export default function WebPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.postId as string

  return (
    <DashboardLayout>
      <WebPostDetail
        postId={postId}
        onBack={() => router.push('/web')}
      />
    </DashboardLayout>
  )
}

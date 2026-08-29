'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { WebArticles } from '@/components/web/WebArticles'
import { useRouter } from 'next/navigation'

export default function WebPage() {
  const router = useRouter()

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto pb-20">
        <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
              🌍 Web
            </h1>
            <p className="text-sm text-brand-secondary mt-1">Blog posts de transformateck.com</p>
          </div>
        </div>

        <WebArticles onPostClick={(postId) => router.push(`/web/${postId}`)} />
      </div>
    </DashboardLayout>
  )
}

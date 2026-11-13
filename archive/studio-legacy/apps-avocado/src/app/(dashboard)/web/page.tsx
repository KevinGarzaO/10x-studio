'use client'

import { WebArticles } from '@/components/web/WebArticles'
import { useRouter } from 'next/navigation'

export default function WebPage() {
  const router = useRouter()

  return (
    <div className="px-8 py-7" style={{ maxWidth: 1100 }}>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#8b5cf6', color: '#fff' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 3c-2.5 3-4 5.7-4 9s1.5 6 4 9M12 3c2.5 3 4 5.7 4 9s-1.5 6-4 9M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
            Web
          </h1>
        </div>
        <p style={{ fontSize: 13.5, color: '#64748b' }}>Blog posts de transformateck.com</p>
      </div>

      <WebArticles onPostClick={(postId) => router.push(`/web/${postId}`)} />
    </div>
  )
}

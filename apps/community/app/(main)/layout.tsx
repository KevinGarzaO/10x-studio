import { Suspense } from 'react'
import { CommunityShell } from '../../components/shell'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <CommunityShell>{children}</CommunityShell>
    </Suspense>
  )
}

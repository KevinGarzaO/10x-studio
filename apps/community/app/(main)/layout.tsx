import { Suspense } from 'react'
import { CommunityShell } from '../../components/shell'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0d1117' }} />}>
      <CommunityShell>{children}</CommunityShell>
    </Suspense>
  )
}

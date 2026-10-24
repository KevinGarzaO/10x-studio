import { Suspense } from 'react'
import { Feed } from '@/components/community-hub'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>Cargando...</div>}>
      <Feed />
    </Suspense>
  )
}

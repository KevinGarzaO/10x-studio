import { Suspense } from 'react'
import { CommunityHub } from '@/components/community-hub'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#8b949e' }}>Cargando...</div>}>
      <CommunityHub />
    </Suspense>
  )
}

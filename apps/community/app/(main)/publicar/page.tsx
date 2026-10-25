import type { Metadata } from 'next'
import { PublishForm } from '@/components/publish-form'

export const metadata: Metadata = {
  title: 'Nueva publicación | AvoTalent',
  robots: { index: false, follow: false },
}

export default function PublicarPage() {
  return <PublishForm />
}

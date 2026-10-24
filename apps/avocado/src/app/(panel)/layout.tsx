import type { Metadata } from 'next'
import './panel.css'
import { PanelShell } from '@/components/panel/PanelShell'

export const metadata: Metadata = {
  title: 'Panel — AvoTalent',
  robots: { index: false, follow: false },
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>
}

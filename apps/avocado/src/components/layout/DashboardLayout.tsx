'use client'

import { usePathname } from 'next/navigation'
import SidebarNew from './SidebarNew'
import { Header } from './Header'
import AvocadoStatusBar from './StatusBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="app-layout">
      <Header />
      <SidebarNew pathname={pathname} />
      <main className="main-content">
        {children}
      </main>
      <AvocadoStatusBar />
    </div>
  )
}

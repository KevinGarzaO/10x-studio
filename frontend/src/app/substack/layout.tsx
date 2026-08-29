'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const SUB_TABS = [
  { href: '/substack', label: 'Artículos', exact: true },
  { href: '/substack/subscribers', label: 'Suscriptores', exact: false },
  { href: '/substack/publish', label: 'Publicar', exact: false },
  { href: '/substack/notes', label: 'Notes', exact: false },
]

export default function SubstackLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto pb-20">
        <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
              <i className="pi pi-at text-brand-secondary"></i> Substack
            </h1>
            <p className="text-sm text-brand-secondary mt-1">Publicación y gestión de suscriptores</p>
          </div>
        </div>

        <div className="flex mb-8 overflow-x-auto no-scrollbar pb-2">
          <div className="inline-flex bg-brand-surface/80 backdrop-blur-md p-1 rounded-xl shadow-inner border border-brand-border whitespace-nowrap">
            {SUB_TABS.map((tab) => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href) && pathname !== '/substack'
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`tab ${isActive || (tab.href === '/substack' && pathname === '/substack') ? 'tab-active' : 'tab-inactive'}`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>

        {children}
      </div>
    </DashboardLayout>
  )
}

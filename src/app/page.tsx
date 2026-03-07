'use client'
import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { TopicsSection } from '@/components/topics/TopicsSection'
import { RedactorSection } from '@/components/redactor/RedactorSection'
import { HistorySection } from '@/components/history/HistorySection'
import { CalendarSection } from '@/components/calendar/CalendarSection'
import { StatsSection } from '@/components/stats/StatsSection'
import { TemplatesSection } from '@/components/templates/TemplatesSection'
import { SubstackSection } from '@/components/substack/SubstackSection'
import { IntegrationsSection } from '@/components/integrations/IntegrationsSection'

import { SettingsSection } from '@/components/settings/SettingsSection'

export type NavSection = 
  | 'dashboard' | 'calendar' | 'stats'
  | 'topics' | 'redactor' | 'templates' | 'history'
  | 'substack' | 'wordpress' | 'linkedin' | 'x'
  | 'contacts' | 'lists' | 'pipelines' | 'interactions'
  | 'webhooks' | 'zapier' | 'api'
  | 'analyzer' | 'community' | 'book' | 'directory'
  | 'integrations' | 'settings' | 'billing' | 'profile' | 'helpdesk' | 'feedback'

export default function Home() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard')
  const [redactorPrefill, setRedactorPrefill] = useState<{ title?: string; notes?: string } | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  function navTo(section: NavSection, prefill?: { title?: string; notes?: string }) {
    setActiveSection(section)
    if (prefill) setRedactorPrefill(prefill)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={activeSection} onNav={navTo} collapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header activeSection={activeSection} />
        <main className="flex-1 overflow-y-auto p-8 bg-[#f7f7f5] transition-all duration-300 relative">
          {activeSection === 'dashboard'     && <Dashboard onNav={navTo} />}
          {activeSection === 'topics'        && <TopicsSection onWriteTopic={(t) => navTo('redactor', t)} />}
          {activeSection === 'redactor'      && <RedactorSection prefill={redactorPrefill} />}
          {activeSection === 'history'       && <HistorySection onRewrite={(t) => navTo('redactor', { title: t })} />}
          {activeSection === 'calendar'      && <CalendarSection />}
          {activeSection === 'stats'         && <StatsSection />}
          {activeSection === 'templates'     && <TemplatesSection />}
          {activeSection === 'substack'      && <SubstackSection />}
          {activeSection === 'integrations'  && <IntegrationsSection />}
          
          {/* Settings / Config Views */}
          {activeSection === 'settings'      && <SettingsSection />}
          {activeSection === 'profile'       && <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-user text-4xl mb-4 opacity-50 block"></i><h2>Perfil & Facturación</h2><p className="text-sm mt-2">Gestión de cuenta y suscripción. (Próximamente)</p></div>}
          {activeSection === 'helpdesk'      && <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-question-circle text-4xl mb-4 opacity-50 block"></i><h2>Centro de Ayuda</h2><p className="text-sm mt-2">Documentación y soporte. (Próximamente)</p></div>}
          {activeSection === 'feedback'      && <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-comment text-4xl mb-4 opacity-50 block"></i><h2>Dar Feedback</h2><p className="text-sm mt-2">Ayúdanos a mejorar enviando tus comentarios y sugerencias. (Próximamente)</p></div>}
        </main>
      </div>
    </div>
  )
}

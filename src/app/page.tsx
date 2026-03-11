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
  | 'dashboard' | 'recent-activity' | 'notifications'
  | 'profile-data' | 'photo-brand' | 'preferences'
  | 'billing-plan' | 'payment-history' | 'change-plan'
  | 'security-password' | 'active-sessions' | 'api-keys'
  | 'help-docs' | 'tutorials' | 'support' | 'feedback'
  | 'cms-dashboard' | 'calendar-month' | 'calendar-week' | 'scheduled'
  | 'content-report' | 'channel-performance' | 'period-comparison'
  | 'ai-chat' | 'chat-history' | 'active-recommendations'
  | 'topics-all' | 'topics-saved' | 'topics-suggested'
  | 'redactor-new' | 'redactor-drafts' | 'redactor-approved'
  | 'templates-mine' | 'templates-pre' | 'templates-create'
  | 'history-all' | 'history-channel' | 'history-date'
  | 'auto-gen-style' | 'auto-gen-schedule' | 'auto-gen-queue'
  | 'substack-dash' | 'substack-posts' | 'substack-create' | 'substack-stats' | 'substack-config'
  | 'wp-dash' | 'wp-posts' | 'wp-create' | 'wp-config'
  | 'li-dash' | 'li-posts' | 'li-create' | 'li-config'
  | 'x-dash' | 'x-posts' | 'x-create' | 'x-config'
  | 'multichannel-create' | 'multichannel-schedule' | 'multichannel-history'
  | 'webhooks-mine' | 'webhooks-create' | 'webhooks-logs'
  | 'zapier-connections' | 'zapier-config'
  | 'integrations-wp' | 'integrations-li' | 'integrations-x' | 'integrations-stripe'
  | 'flows-mine' | 'flows-create' | 'flows-templates'
  | 'crm-contacts' | 'crm-import' | 'crm-export'
  | 'crm-lists' | 'crm-segment-create' | 'crm-segment-ia'
  | 'crm-pipelines' | 'crm-pipeline-create' | 'crm-stages'
  | 'leads-active' | 'leads-process' | 'leads-closed'
  | 'providers-dir' | 'providers-favs' | 'providers-add'
  | 'leads-history-date' | 'leads-history-provider' | 'leads-history-cat'
  | 'copilot-chat-new' | 'copilot-chat-history'
  | 'rec-active' | 'rec-archived'
  | 'biz-report' | 'biz-oppoutunities' | 'biz-suggested-providers'
  | 'fin-balance' | 'fin-history'
  | 'loan-active' | 'loan-request' | 'loan-history'
  | 'pay-next' | 'pay-now' | 'pay-vouchers'
  | 'trans-analyzer' | 'trans-reports' | 'trans-recommendations'
  | 'trans-feed' | 'trans-groups' | 'trans-events'
  | 'trans-library' | 'trans-tutorials'
  | 'trans-providers' | 'trans-members'
  // Legacy or generic
  | 'substack' | 'settings' | 'redactor' | 'topics' | 'calendar' | 'stats' | 'history' | 'templates' | 'integrations'

export default function Home() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard')
  const [redactorPrefill, setRedactorPrefill] = useState<{ title?: string; notes?: string } | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  function navTo(section: NavSection, prefill?: { title?: string; notes?: string }) {
    setActiveSection(section)
    if (prefill) setRedactorPrefill(prefill)
    setIsMobileMenuOpen(false) // Horizontal close on nav
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':     return <Dashboard onNav={navTo} />
      case 'topics-all':    return <TopicsSection onWriteTopic={(t) => navTo('redactor-new', t)} />
      case 'redactor-new':  return <RedactorSection prefill={redactorPrefill} />
      case 'history-all':   return <HistorySection onRewrite={(t) => navTo('redactor-new', { title: t })} />
      case 'calendar-month': return <CalendarSection />
      case 'substack-stats': return <StatsSection />
      case 'templates-mine': return <TemplatesSection />
      case 'substack-dash':  return <SubstackSection />
      case 'integrations':   return <IntegrationsSection />
      case 'security-password': return <SettingsSection />
      case 'profile-data':      return <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-user text-4xl mb-4 opacity-50 block"></i><h2>Perfil & Facturación</h2><p className="text-sm mt-2">Gestión de cuenta y suscripción. (Próximamente)</p></div>
      case 'help-docs':         return <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-question-circle text-4xl mb-4 opacity-50 block"></i><h2>Centro de Ayuda</h2><p className="text-sm mt-2">Documentación y soporte. (Próximamente)</p></div>
      case 'feedback':          return <div className="p-8 text-center text-stone-500 mt-20"><i className="pi pi-comment text-4xl mb-4 opacity-50 block"></i><h2>Dar Feedback</h2><p className="text-sm mt-2">Ayúdanos a mejorar enviando tus comentarios y sugerencias. (Próximamente)</p></div>
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-stone-400 py-20">
            <i className="pi pi-map-marker text-5xl mb-4 opacity-20"></i>
            <h2 className="text-xl font-bold text-stone-500">Módulo en construcción</h2>
            <p className="text-sm mt-2 max-w-xs text-center">Estamos trabajando para habilitar la sección <b>{activeSection}</b> muy pronto.</p>
            <button onClick={() => navTo('dashboard')} className="btn btn-ghost mt-6">Regresar al Dashboard</button>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        active={activeSection} 
        onNav={navTo} 
        collapsed={isSidebarCollapsed} 
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
        mobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header activeSection={activeSection} onMenuClick={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#f7f7f5] transition-all duration-300 relative">
          {renderSection()}
        </main>
      </div>
    </div>
  )
}

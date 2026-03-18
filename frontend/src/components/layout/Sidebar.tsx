'use client'
import { useState, useEffect } from 'react'
import { useApp } from './AppProvider'
import type { NavSection } from '@/app/page'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'

type SubmenuItem = {
  id: NavSection;
  label: string;
  pro?: boolean;
  soon?: boolean;
}

type MenuCategory = {
  label: string;
  icon?: string;
  items: SubmenuItem[];
  pro?: boolean;
  soon?: boolean;
}

type NavModule = {
  id: string;
  title: string;
  icon: string;
  categories: MenuCategory[];
  pro?: boolean;
}

const ERP_MENU: NavModule[] = [
  {
    id: 'core',
    title: 'CORE',
    icon: 'pi pi-cog',
    categories: [
      {
        label: 'Dashboard',
        icon: 'pi pi-home',
        items: [
          { id: 'dashboard', label: 'Resumen general' },
          { id: 'recent-activity', label: 'Actividad reciente' },
          { id: 'notifications', label: 'Notificaciones' },
        ]
      },
      {
        label: 'Mi Perfil',
        icon: 'pi pi-user',
        items: [
          { id: 'profile-data', label: 'Datos personales' },
          { id: 'photo-brand', label: 'Foto & marca' },
          { id: 'preferences', label: 'Preferencias' },
        ]
      },
      {
        label: 'Facturación',
        icon: 'pi pi-credit-card',
        items: [
          { id: 'billing-plan', label: 'Plan actual' },
          { id: 'payment-history', label: 'Historial de pagos' },
          { id: 'change-plan', label: 'Cambiar plan' },
        ]
      },
      {
        label: 'Seguridad',
        icon: 'pi pi-lock',
        items: [
          { id: 'security-password', label: 'Contraseña' },
          { id: 'active-sessions', label: 'Sesiones activas' },
          { id: 'api-keys', label: 'API Keys' },
        ]
      },
      {
        label: 'Ayuda',
        icon: 'pi pi-question-circle',
        items: [
          { id: 'help-docs', label: 'Documentación' },
          { id: 'tutorials', label: 'Tutoriales' },
          { id: 'support', label: 'Soporte' },
          { id: 'feedback', label: 'Dar feedback' },
        ]
      }
    ]
  },
  {
    id: 'cms',
    title: 'CMS',
    icon: 'pi pi-compass',
    categories: [
      {
        label: 'Estrategia',
        icon: 'pi pi-chart-bar',
        items: [
          { id: 'cms-dashboard', label: 'Dashboard CMS' },
          { id: 'calendar-month', label: 'Calendario editorial' },
          { id: 'content-report', label: 'Auditoría & análisis' },
          { id: 'ai-chat', label: 'Co-pilot de Negocio', pro: true },
        ]
      },
      {
        label: 'Content Ops',
        icon: 'pi pi-pencil',
        items: [
          { id: 'topics-all', label: 'Banco de temas' },
          { id: 'redactor-new', label: 'Redactor IA' },
          { id: 'templates-mine', label: 'Plantillas & formatos' },
          { id: 'history-all', label: 'Historial' },
          { id: 'auto-gen-style', label: 'Generador automático', pro: true },
        ]
      },
      {
        label: 'Canales',
        icon: 'pi pi-send',
        items: [
          { id: 'substack-dash', label: 'Substack' },
          { id: 'wp-dash', label: 'WordPress', soon: true },
          { id: 'li-dash', label: 'LinkedIn', soon: true },
          { id: 'x-dash', label: 'X / Twitter', soon: true },
          { id: 'multichannel-create', label: 'Multicanal', pro: true },
        ]
      },
      {
        label: 'Automatización',
        icon: 'pi pi-bolt',
        items: [
          { id: 'webhooks-mine', label: 'Webhooks' },
          { id: 'zapier-connections', label: 'Zapier / Make' },
          { id: 'integrations-wp', label: 'Integraciones' },
          { id: 'flows-mine', label: 'Flujos automáticos', pro: true },
        ]
      }
    ]
  },
  {
    id: 'crm',
    title: 'CRM',
    icon: 'pi pi-users',
    categories: [
      {
        label: 'Audiencia',
        icon: 'pi pi-list',
        items: [
          { id: 'crm-contacts', label: 'Contactos' },
          { id: 'crm-lists', label: 'Listas & segmentos' },
          { id: 'crm-pipelines', label: 'Pipelines' },
        ]
      },
      {
        label: 'Leads',
        icon: 'pi pi-target',
        pro: true,
        items: [
          { id: 'leads-active', label: 'Leads activos' },
          { id: 'providers-dir', label: 'Proveedores' },
          { id: 'leads-history-date', label: 'Historial de leads' },
        ]
      },
      {
        label: 'Co-pilot de Negocio',
        icon: 'pi pi-android',
        pro: true,
        items: [
          { id: 'copilot-chat-new', label: 'Chat con IA' },
          { id: 'rec-active', label: 'Recomendaciones' },
          { id: 'biz-report', label: 'Análisis de negocio' },
        ]
      }
    ]
  },
  {
    id: 'finanzas',
    title: 'FINANZAS',
    icon: 'pi pi-money-bill',
    pro: true,
    categories: [
      {
        label: 'Mi Cartera',
        icon: 'pi pi-wallet',
        items: [
          { id: 'fin-balance', label: 'Estado de cuenta' },
          { id: 'fin-history', label: 'Historial financiero' },
        ]
      },
      {
        label: 'Préstamos',
        icon: 'pi pi-percentage',
        items: [
          { id: 'loan-active', label: 'Mi préstamo activo' },
          { id: 'loan-request', label: 'Solicitar préstamo' },
          { id: 'loan-history', label: 'Historial de préstamos' },
        ]
      },
      {
        label: 'Pagos',
        icon: 'pi pi-credit-card',
        items: [
          { id: 'pay-next', label: 'Próximos pagos' },
          { id: 'pay-now', label: 'Pagar ahora' },
          { id: 'pay-vouchers', label: 'Comprobantes' },
        ]
      }
    ]
  },
  {
    id: 'transformateck',
    title: 'TRANSFORMATECK',
    icon: 'pi pi-star',
    categories: [
      {
        label: 'El Analizador',
        icon: 'pi pi-search',
        pro: true,
        items: [
          { id: 'trans-analyzer', label: 'Analizar mi negocio' },
          { id: 'trans-reports', label: 'Reportes' },
          { id: 'trans-recommendations', label: 'Recomendaciones' },
        ]
      },
      {
        label: 'Comunidad',
        icon: 'pi pi-comments',
        items: [
          { id: 'trans-feed', label: 'Feed' },
          { id: 'trans-groups', label: 'Grupos' },
          { id: 'trans-events', label: 'Eventos' },
        ]
      },
      {
        label: 'Recursos',
        icon: 'pi pi-book',
        items: [
          { id: 'trans-library', label: 'Biblioteca' },
          { id: 'trans-tutorials', label: 'Tutoriales' },
        ]
      },
      {
        label: 'Directorio',
        icon: 'pi pi-map-marker',
        items: [
          { id: 'trans-providers', label: 'Proveedores' },
          { id: 'trans-members', label: 'Miembros' },
        ]
      }
    ]
  }
]

interface Props { 
  active: NavSection; 
  onNav: (s: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ active, onNav, collapsed, onToggleCollapse, mobileOpen, onMobileClose }: Props) {
  const { settings } = useApp()
  const [activeModule, setActiveModule] = useState<string>('core')
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})

  // Sync state when active section changes from external sources
  useEffect(() => {
    const mod = ERP_MENU.find(m => m.categories.some(c => c.items.some(i => i.id === active)))
    if (mod) {
      setActiveModule(mod.id)
      ERP_MENU.forEach(m => {
        m.categories.forEach(c => {
          if (c.items.some(i => i.id === active)) {
            setExpandedCats(prev => ({ ...prev, [`${m.id}-${c.label}`]: true }))
          }
        })
      })
    }
  }, [active])

  const toggleCat = (modId: string, label: string) => {
    const key = `${modId}-${label}`
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const sidebarWidth = collapsed ? 'w-[70px]' : 'w-[280px]'

  return (
    <>
      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fadein" 
          onClick={onMobileClose}
        />
      )}

      <aside className={`
        ${sidebarWidth} bg-brand-bg flex flex-col flex-shrink-0 h-screen transition-all duration-300 group z-50
        ${mobileOpen ? 'fixed left-0 top-0 bottom-0 translate-x-0 shadow-2xl' : 'fixed -translate-x-full md:relative md:translate-x-0'}
      `}>
        
        {/* Collapse Toggle (Desktop only) */}
        <button 
          onClick={onToggleCollapse}
          className="absolute -right-3 top-6 bg-brand-surface border-2 border-brand-bg text-brand-primary w-6 h-6 rounded-full hidden md:flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-brand-border"
        >
          <i className={`pi ${collapsed ? 'pi-chevron-right' : 'pi-chevron-left'} !text-[10px]`}></i>
        </button>

        {/* Logo */}
        <div className={`flex items-center px-6 pt-6 pb-6 ${collapsed ? 'justify-center !px-2' : ''}`}>
          <div className="w-9 h-9 relative flex-shrink-0">
             <img src="/icon-192.png" alt="Avocado" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col ml-3">
              <span className="text-white font-black leading-none tracking-tight text-lg">AVOCADO</span>
              <span className="text-[10px] text-brand-accent font-bold uppercase tracking-[0.2em] mt-0.5">ESTUDIO</span>
            </div>
          )}
        </div>

        {/* Modules Strip (Level 1) */}
        <div className={`flex border-b border-brand-border bg-brand-surface/50 ${collapsed ? 'flex-col gap-2 p-2' : 'px-2 py-2 gap-1 overflow-x-auto no-scrollbar'}`}>
          {ERP_MENU.map(mod => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`
                flex items-center justify-center p-2 rounded-xl transition-all relative group/mod
                ${activeModule === mod.id ? 'bg-brand-accent text-[#1A1A1A]' : 'text-brand-secondary hover:text-brand-primary hover:bg-brand-surface'}
                ${collapsed ? 'w-10 h-10' : 'flex-1 min-w-[40px] h-10'}
              `}
              title={mod.title}
            >
              <i className={`${mod.icon} ${collapsed ? 'text-lg' : 'text-base'}`}></i>
              {!collapsed && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full opacity-0 scale-0 transition-all group-hover/mod:opacity-100 group-hover/mod:scale-100"></span>}
            </button>
          ))}
        </div>

        {/* Categories & Submenus (Level 2 & 3) */}
        <nav className={`flex-1 overflow-y-auto no-scrollbar py-4 ${collapsed ? 'px-2' : 'px-4'}`}>
          {!collapsed ? (
            <div className="space-y-4">
              {ERP_MENU.find(m => m.id === activeModule)?.categories.map(cat => {
                const key = `${activeModule}-${cat.label}`
                const expanded = expandedCats[key]
                return (
                  <div key={cat.label} className="space-y-1">
                    <button 
                      onClick={() => toggleCat(activeModule, cat.label)}
                      className="w-full flex items-center justify-between text-[11px] font-bold text-brand-secondary uppercase tracking-widest py-2 px-2 hover:text-brand-primary transition-colors"
                    >
                      <div className="flex items-center gap-3">
                         {cat.icon && <i className={cat.icon}></i>}
                         <span>{cat.label}</span>
                         {cat.pro && <span className="text-[10px]">🔒</span>}
                         {cat.soon && <span className="text-[8px] bg-brand-surface px-1 rounded ml-1">🔜</span>}
                      </div>
                      <i className={`pi pi-chevron-${expanded ? 'down' : 'right'} text-[8px]`}></i>
                    </button>
                    
                    <div className={`space-y-0.5 ml-2 border-l border-brand-border pl-2 overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                      {cat.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => { onNav(item.id); onMobileClose(); }}
                          disabled={item.soon}
                          className={`
                            w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all flex items-center justify-between
                            ${active === item.id ? 'bg-brand-accent/10 text-brand-accent font-semibold' : 'text-brand-secondary hover:text-brand-primary hover:bg-brand-surface'}
                            ${item.soon ? 'opacity-40 cursor-not-allowed' : ''}
                          `}
                        >
                          <span>{item.label}</span>
                          {item.pro && <span className="text-[10px]">🔒</span>}
                          {item.soon && <span className="text-[8px] bg-brand-surface px-1 rounded">🔜</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
               {ERP_MENU.find(m => m.id === activeModule)?.categories.map(cat => (
                 <div key={cat.label} className="w-10 h-10 rounded-xl bg-brand-surface flex items-center justify-center text-brand-secondary group/cat relative">
                    <i className={cat.icon || 'pi pi-folder'}></i>
                    {/* Tooltip or Side Popover could go here */}
                 </div>
               ))}
            </div>
          )}
        </nav>

        {/* User / Niche Footer */}
        <div className={`p-4 border-t border-brand-border ${collapsed ? 'items-center' : ''}`}>
           {!collapsed && (
             <div className="bg-brand-surface rounded-2xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-brand-primary font-bold">
                  {settings.niche ? settings.niche[0].toUpperCase() : 'N'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] text-brand-primary font-bold truncate">{settings.niche || 'Productor'}</span>
                  <span className="text-[10px] text-brand-secondary font-medium">Plan gratuito</span>
                </div>
             </div>
           )}
           {collapsed && (
             <div className="w-10 h-10 rounded-xl bg-brand-surface flex items-center justify-center text-brand-secondary">
                <i className="pi pi-user"></i>
             </div>
           )}
        </div>

      </aside>
    </>
  )
}


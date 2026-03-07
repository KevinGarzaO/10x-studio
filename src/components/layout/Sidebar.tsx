'use client'
import { useState } from 'react'
import { useApp } from './AppProvider'
import type { NavSection } from '@/app/page'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'

type NavItem = {
  id: NavSection;
  icon: string;
  label: string;
  soon?: boolean;
}

type NavModule = {
  title: string;
  headerIcon: string;
  items: NavItem[];
}

const MENU_MODULES: NavModule[] = [
  {
    title: 'Estrategia',
    headerIcon: 'pi pi-compass', // O pi-map
    items: [
      { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
      { id: 'calendar', icon: '📅', label: 'Calendario Editorial' },
      { id: 'stats', icon: '📈', label: 'Auditoría & Análisis' },
    ]
  },
  {
    title: 'Content Ops',
    headerIcon: 'pi pi-briefcase',
    items: [
      { id: 'topics', icon: '💡', label: 'Banco de Temas' },
      { id: 'redactor', icon: '✍️', label: 'Redactor IA' },
      { id: 'templates', icon: '🗂', label: 'Plantillas & Formatos' },
      { id: 'history', icon: '📚', label: 'Historial' },
    ]
  },
  {
    title: 'Canales',
    headerIcon: 'pi pi-send',
    items: [
      { id: 'substack', icon: '📰', label: 'Substack' },
      { id: 'wordpress', icon: '📝', label: 'WordPress', soon: true },
      { id: 'linkedin', icon: '👔', label: 'LinkedIn', soon: true },
      { id: 'x', icon: '🐦', label: 'X (Twitter)', soon: true },
    ]
  },
  {
    title: 'Audiencia',
    headerIcon: 'pi pi-users',
    items: [
      { id: 'contacts', icon: '👥', label: 'Contactos', soon: true },
      { id: 'lists', icon: '📋', label: 'Listas & Segmentos', soon: true },
      { id: 'pipelines', icon: '🎯', label: 'Pipelines', soon: true },
    ]
  },
  {
    title: 'Automatización',
    headerIcon: 'pi pi-bolt',
    items: [
      { id: 'webhooks', icon: '⚡', label: 'Webhooks', soon: true },
      { id: 'zapier', icon: '🔄', label: 'Zapier / Make', soon: true },
      { id: 'integrations', icon: '🔌', label: 'Integraciones' },
    ]
  },
  {
    title: 'Transformateck',
    headerIcon: 'pi pi-star',
    items: [
      { id: 'analyzer', icon: '🔍', label: 'El Analizador', soon: true },
      { id: 'community', icon: '💬', label: 'Comunidad', soon: true },
      { id: 'book', icon: '📖', label: 'Recursos', soon: true },
      { id: 'directory', icon: '🌍', label: 'Directorio', soon: true },
    ]
  },
  {
    title: 'Configuración',
    headerIcon: 'pi pi-cog',
    items: [
      { id: 'settings', icon: '⚙️', label: 'Mi Workspace' },
      { id: 'profile', icon: '👤', label: 'Perfil & Facturación', soon: true },
      { id: 'helpdesk', icon: '🆘', label: 'Centro de Ayuda', soon: true },
      { id: 'feedback', icon: '✨', label: 'Dar Feedback', soon: true },
    ]
  }
]

interface Props { 
  active: NavSection; 
  onNav: (s: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ active, onNav, collapsed, onToggleCollapse }: Props) {
  const { settings, saveSettings } = useApp()
  const [editing, setEditing] = useState(false)
  const [niche,   setNiche]   = useState('')
  
  // Track ONLY the active module to ensure all others are closed
  const [expandedModule, setExpandedModule] = useState<string | null>(() => {
    const activeModule = MENU_MODULES.find(m => m.items.some(i => i.id === active))
    return activeModule ? activeModule.title : null
  })

  // Whenever 'active' changes externally, ensure that module opens
  // (Optional: You can use a useEffect for this if active can change outside the Sidebar)
  
  const toggleModule = (title: string) => {
    if (collapsed) {
      onToggleCollapse();
      setExpandedModule(title)
    } else {
      setExpandedModule(prev => prev === title ? null : title)
    }
  }

  function startEdit() { setNiche(settings.niche); setEditing(true) }
  async function saveNiche() {
    await saveSettings({ ...settings, niche: niche.trim() })
    setEditing(false)
  }

  const sidebarWidth = collapsed ? 'w-[70px]' : 'w-[260px]' // Slightly wider to fit longer names

  return (
    <aside className={`${sidebarWidth} bg-[#191919] flex flex-col flex-shrink-0 h-screen transition-all duration-300 relative group`}>
      
      {/* Collapse Toggle Button */}
      <button 
        onClick={onToggleCollapse}
        className="absolute -right-3 top-6 bg-[#2a2a2a] border-2 border-[#191919] text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-[#444]"
        title={collapsed ? "Expandir panel" : "Colapsar panel"}
      >
        <i className={`pi ${collapsed ? 'pi-chevron-right' : 'pi-chevron-left'} !text-[10px]`}></i>
      </button>

      {/* Logo */}
      <div className={`flex items-center px-4 pt-4 pb-5 ${collapsed ? 'justify-center !px-2' : 'gap-1'}`}>
        <span className="text-[22px] font-extrabold text-white leading-none tracking-[-1.5px]">10</span>
        <span className="text-[22px] font-extrabold text-white leading-none tracking-[-1px]">X</span>
        {!collapsed && <span className="text-[13px] font-normal text-[#666] ml-1 mt-0.5 whitespace-nowrap overflow-hidden transition-all duration-300">Studio</span>}
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} overflow-x-hidden overflow-y-auto no-scrollbar pb-6`}>
        {MENU_MODULES.map((module, idx) => {
          const isExpanded = expandedModule === module.title
          const hasActiveItem = module.items.some(i => i.id === active)
          
          return (
            <div key={module.title} className={`${idx > 0 && !collapsed ? 'mt-3' : 'mt-1'}`}>
              
              {/* Module Header */}
              {!collapsed ? (
                <button 
                  onClick={() => toggleModule(module.title)}
                  className={`w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.05em] py-2 mb-1 transition-colors px-2 rounded-md ${hasActiveItem && !isExpanded ? 'text-white bg-[#222]' : 'text-[#777] hover:text-[#aaa] hover:bg-[#222]'}`}
                >
                  <div className="flex items-center gap-2">
                    <i className={`${module.headerIcon} text-[10px]`}></i>
                    <span className="whitespace-nowrap overflow-hidden">{module.title}</span>
                  </div>
                  <i className={`pi ${isExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-[9px]`}></i>
                </button>
              ) : (
                <div className="w-full flex justify-center py-2 mb-1 text-[#555] cursor-pointer hover:text-[#888] transition-colors" title={module.title} onClick={() => toggleModule(module.title)}>
                  <i className={`${module.headerIcon} text-sm`}></i>
                </div>
              )}

              {/* Module Items */}
              <div className={`overflow-hidden transition-all duration-300 ${!collapsed && !isExpanded ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                {module.items.map(item => {
                  const isActive = active === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => !item.soon && onNav(item.id)}
                      title={collapsed ? item.label : undefined}
                      disabled={item.soon}
                      className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} py-[8px] text-[13.5px] rounded-[6px] mb-0.5 transition-all text-left ${
                        isActive
                          ? 'bg-[#2f2f2f] text-white font-medium shadow-sm'
                          : item.soon 
                            ? 'text-[#555] cursor-not-allowed opacity-60'
                            : 'text-[#aaa] hover:bg-[#2a2a2a] hover:text-[#e8e8e8]'
                      }`}>
                      <span className={`text-[16px] flex items-center justify-center flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-80'} ${collapsed ? 'w-full' : 'w-5'}`}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <div className="flex-1 flex items-center justify-between whitespace-nowrap overflow-hidden min-w-0">
                          <span className="truncate">{item.label}</span>
                          {item.soon && <span className="text-[9px] uppercase tracking-wider bg-[#222] text-[#666] px-1.5 py-0.5 rounded ml-2">Pronto</span>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

            </div>
          )
        })}
      </nav>

      {/* Footer — Settings / Niche */}
      <div className={`py-4 border-t border-[#2a2a2a] ${collapsed ? 'px-2 flex flex-col items-center' : 'px-3'} mt-auto bg-[#191919] z-10`}>
        {!collapsed && <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mb-1.5 whitespace-nowrap overflow-hidden">Nicho activo</p>}
        {editing && !collapsed ? (
          <div className="flex gap-1 w-full">
            <InputText
              value={niche}
              onChange={e => setNiche(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNiche()}
              className="p-inputtext-sm w-full !bg-[#2a2a2a] !border-[#444] text-white !px-2 !py-1 !font-mono focus:!border-[#666]"
              autoFocus
            />
            <Button onClick={saveNiche} icon="pi pi-check" className="p-button-sm !px-2 !py-1 !bg-white !text-black !border-none" />
          </div>
        ) : (
          <button
            onClick={() => !collapsed && startEdit()}
            title={collapsed ? `Nicho: ${settings.niche || 'Sin definir'}` : undefined}
            className={`flex items-center text-[12px] text-[#888] hover:text-[#ccc] transition-colors bg-[#222] border border-[#333] rounded py-1.5 w-full ${collapsed ? 'justify-center px-0' : 'gap-1.5 px-2.5'}`}>
            <span>🏷</span>
            {!collapsed && (
              <>
                <span className="truncate whitespace-nowrap flex-1 text-left">{settings.niche || 'Sin definir'}</span>
                <span className="text-[10px] ml-1">✏️</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  )
}


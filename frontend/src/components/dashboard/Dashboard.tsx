'use client'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS } from '@/types'
import { fmtDate, dateStr } from '@/lib/utils'
import type { NavSection } from '@/app/page'

export function Dashboard({ onNav }: { onNav: (s: NavSection) => void }) {
  const { topics, history, calendar } = useApp()
  const today     = dateStr()
  const pending   = calendar.filter(e => e.status === 'pending')
  const published = calendar.filter(e => e.status === 'published')
  const upcoming  = [...pending].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  const ready     = topics.filter(t => t.status === 'ready').slice(0, 5)
  const recent    = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  const stats = [
    { label: 'Temas en banco',          value: topics.length,    icon: 'pi-database' },
    { label: 'Artículos generados',     value: history.length,   icon: 'pi-file-edit' },
    { label: 'Publicaciones agendadas', value: pending.length,   icon: 'pi-calendar-plus' },
    { label: 'Publicados',              value: published.length, icon: 'pi-check-circle' },
  ]

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-home text-brand-secondary"></i> Dashboard
          </h1>
          <p className="text-sm text-brand-secondary mt-1">Resumen de tu estrategia de contenido</p>
        </div>
        <button className="btn btn-primary w-full md:w-auto shadow-lg" onClick={() => onNav('redactor-new')}>
          <i className="pi pi-plus mr-1 text-[10px]"></i>
          Nuevo artículo
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <div key={s.label} className="bg-brand-surface border border-brand-border shadow-[var(--shadow)] rounded-2xl px-5 py-5 hover:-translate-y-1 hover:border-brand-accent transition-all duration-300 cursor-default">
            <i className={`pi ${s.icon} text-brand-secondary/40 text-xs mb-3 block`}></i>
            <div className="text-[10px] font-bold text-brand-secondary tracking-widest mb-2">{s.label}</div>
            <div className="text-2xl md:text-[32px] font-black text-brand-primary leading-none tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Upcoming */}
        <div className="card shadow-sm">
          <div className="panel-header-dark">
            <span className="panel-title flex items-center gap-2"><i className="pi pi-calendar"></i> Próximas publicaciones</span>
            <button className="text-[11px] text-brand-accent font-bold hover:brightness-110 transition-colors flex items-center gap-1" onClick={() => onNav('calendar')}>Ver calendario <i className="pi pi-arrow-right text-[10px]"></i></button>
          </div>
          <div>
            {upcoming.length ? upcoming.map(e => {
              const t = topics.find(t => t.id === e.topicId)
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3 border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors">
                  <span className="text-xs text-brand-secondary min-w-[60px] font-mono">{fmtDate(e.date)}</span>
                  <span>{PLATFORMS[e.platform]?.icon}</span>
                  <span className="text-sm font-medium flex-1 truncate text-brand-primary">{t?.title || 'Sin tema'}</span>
                </div>
              )
            }) : (
              <div className="py-8 text-center">
                <i className="pi pi-calendar text-2xl text-stone-300 mb-2 block"></i>
                <p className="text-sm text-stone-400 font-medium">Sin publicaciones agendadas</p>
                <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('calendar')}>Ir al calendario</button>
              </div>
            )}
          </div>
        </div>

        {/* Ready topics */}
        <div className="card shadow-sm">
          <div className="panel-header-dark">
            <span className="panel-title flex items-center gap-2"><i className="pi pi-check-circle"></i> Listos para escribir</span>
            <button className="text-[11px] text-brand-accent font-bold hover:brightness-110 transition-colors flex items-center gap-1" onClick={() => onNav('topics')}>Ver temas <i className="pi pi-arrow-right text-[10px]"></i></button>
          </div>
          <div>
            {ready.length ? ready.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors">
                <span className="text-sm flex-1 truncate text-brand-primary font-medium">{t.title}</span>
                <button className="btn btn-secondary btn-sm h-7 text-[10px] px-3 font-bold" onClick={() => onNav('redactor')}>Escribir</button>
              </div>
            )) : (
              <div className="py-8 text-center">
                <i className="pi pi-lightbulb text-2xl text-stone-300 mb-2 block"></i>
                <p className="text-sm text-stone-400 font-medium">No hay temas listos</p>
                <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('topics')}>Agregar temas</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="card shadow-sm">
        <div className="panel-header-dark">
          <div className="flex items-center gap-2">
            <i className="pi pi-history text-brand-secondary"></i>
            <span className="panel-title">Últimos artículos generados</span>
          </div>
        </div>
        <div>
          {recent.length ? recent.map(h => (
            <div key={h.id} className="flex items-center gap-3 px-5 py-3 border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors">
              <span className="text-xs text-brand-secondary min-w-[72px] font-mono">{fmtDate(h.date)}</span>
              <span className="text-sm font-medium flex-1 truncate text-brand-primary">{h.topic}</span>
              <div className="flex gap-1">
                {(h.platforms || []).map(p => (
                  <span key={p} title={PLATFORMS[p]?.label}>{PLATFORMS[p]?.icon}</span>
                ))}
              </div>
            </div>
          )) : (
            <div className="py-8 text-center">
              <i className="pi pi-file-edit text-2xl text-stone-300 mb-2 block"></i>
              <p className="text-sm text-stone-400 font-medium">Aún no has generado artículos</p>
              <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('redactor')}>Crear primer artículo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

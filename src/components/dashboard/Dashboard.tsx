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
    { label: 'Temas en banco',          value: topics.length },
    { label: 'Artículos generados',     value: history.length },
    { label: 'Publicaciones agendadas', value: pending.length },
    { label: 'Publicados',              value: published.length },
  ]

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-home text-[#9b9a97]"></i> Dashboard
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Resumen de tu estrategia de contenido</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNav('redactor')}>+ Nuevo artículo</button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <div key={s.label} className="bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_4px_20px_rgb(0,0,0,0.04)] rounded-2xl px-5 py-5 hover:-translate-y-1 hover:shadow-lg hover:border-stone-300 transition-all duration-300 cursor-default">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">{s.label}</div>
            <div className="text-[36px] font-black text-stone-900 leading-none tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Upcoming */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-white uppercase tracking-wide flex items-center gap-2"><i className="pi pi-calendar"></i> Próximas publicaciones</span>
            <button className="text-[11px] text-white/80 hover:text-white transition-colors flex items-center gap-1" onClick={() => onNav('calendar')}>Ver calendario <i className="pi pi-arrow-right text-[10px]"></i></button>
          </div>
          <div>
            {upcoming.length ? upcoming.map(e => {
              const t = topics.find(t => t.id === e.topicId)
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#f0f0f0] last:border-0 hover:bg-[#f7f7f5] transition-colors">
                  <span className="text-xs text-[#9b9a97] min-w-[60px] font-mono">{fmtDate(e.date)}</span>
                  <span>{PLATFORMS[e.platform]?.icon}</span>
                  <span className="text-sm font-medium flex-1 truncate text-[#37352f]">{t?.title || 'Sin tema'}</span>
                </div>
              )
            }) : (
              <div className="py-8 text-center">
                <i className="pi pi-calendar text-2xl text-stone-300 mb-2 block"></i>
                <p className="text-sm text-stone-400 font-medium">Sin publicaciones agendadas</p>
                <button className="mt-3 text-xs font-medium text-stone-600 underline hover:text-stone-900 transition-colors" onClick={() => onNav('calendar')}>Ir al calendario</button>
              </div>
            )}
          </div>
        </div>

        {/* Ready topics */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-white uppercase tracking-wide flex items-center gap-2"><i className="pi pi-check-circle"></i> Listos para escribir</span>
            <button className="text-[11px] text-white/80 hover:text-white transition-colors flex items-center gap-1" onClick={() => onNav('topics')}>Ver temas <i className="pi pi-arrow-right text-[10px]"></i></button>
          </div>
          <div>
            {ready.length ? ready.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-[#f0f0f0] last:border-0 hover:bg-[#f7f7f5] transition-colors">
                <span className="text-sm flex-1 truncate text-[#37352f] font-medium">{t.title}</span>
                <button className="btn btn-primary btn-sm" onClick={() => onNav('redactor')}>Escribir</button>
              </div>
            )) : (
              <div className="py-8 text-center">
                <i className="pi pi-lightbulb text-2xl text-stone-300 mb-2 block"></i>
                <p className="text-sm text-stone-400 font-medium">No hay temas listos</p>
                <button className="mt-3 text-xs font-medium text-stone-600 underline hover:text-stone-900 transition-colors" onClick={() => onNav('topics')}>Agregar temas</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
          <i className="pi pi-history text-[#666]"></i>
          <span className="text-xs font-semibold text-white uppercase tracking-wide">Últimos artículos generados</span>
        </div>
        <div>
          {recent.length ? recent.map(h => (
            <div key={h.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#f0f0f0] last:border-0 hover:bg-[#f7f7f5] transition-colors">
              <span className="text-xs text-[#9b9a97] min-w-[72px] font-mono">{fmtDate(h.date)}</span>
              <span className="text-sm font-medium flex-1 truncate text-[#37352f]">{h.topic}</span>
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
              <button className="mt-3 text-xs text-stone-500 underline hover:text-stone-800 transition-colors" onClick={() => onNav('redactor')}>Crear primer artículo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

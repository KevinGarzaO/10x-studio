'use client'
import { useMemo } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS, ALL_PLATFORMS, type Platform } from '@/types'
import { fmtDate } from '@/lib/utils'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-[#e9e9e7] rounded-full h-2.5">
        <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-[#191919] w-6 text-right">{value}</span>
    </div>
  )
}

export function StatsSection() {
  const { history, topics, calendar } = useApp()

  const stats = useMemo(() => {
    // Articles per platform
    const byPlatform: Record<string, number> = {}
    ALL_PLATFORMS.forEach(p => { byPlatform[p] = 0 })
    history.forEach(h => h.platforms.forEach(p => { byPlatform[p] = (byPlatform[p] || 0) + 1 }))

    // Articles per month (last 6 months)
    const monthMap: Record<string, number> = {}
    history.forEach(h => {
      const key = h.date.slice(0, 7) // YYYY-MM
      monthMap[key] = (monthMap[key] || 0) + 1
    })
    const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)

    // Topics by status
    const byStatus = { idea: 0, ready: 0, writing: 0, done: 0 }
    topics.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })

    // Total words
    const totalWords = history.reduce((s, h) => s + (h.wordCount || 0), 0)

    // Publishing consistency (days with content scheduled or published)
    const activeDays = new Set(calendar.map(e => e.date)).size

    // Most productive month
    const bestMonth = months.reduce((best, cur) => cur[1] > (best?.[1] || 0) ? cur : best, months[0])

    return { byPlatform, months, byStatus, totalWords, activeDays, bestMonth }
  }, [history, topics, calendar])

  const maxPlatform = Math.max(...Object.values(stats.byPlatform), 1)
  const maxMonth    = Math.max(...stats.months.map(m => m[1]), 1)

  const platformColors: Record<Platform, string> = {
    'blog':               '#c9963a',
    'linkedin-post':      '#2d6fa4',
    'linkedin-article':   '#1a3f6b',
    'substack-article':   '#e67e22',
    'substack-note':      '#e8a04a',
  }

  function fmtMonth(key: string) {
    const [y, m] = key.split('-')
    return new Date(+y, +m - 1).toLocaleString('es-MX', { month: 'short', year: '2-digit' })
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-chart-line text-[#9b9a97]"></i> Auditoría & Análisis
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Análisis de tu actividad de contenido</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Artículos generados', value: history.length },
          { label: 'Palabras totales',    value: stats.totalWords.toLocaleString() },
          { label: 'Temas en banco',      value: topics.length },
          { label: 'Días con contenido',  value: stats.activeDays },
        ].map(k => (
          <div key={k.label} className="bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_4px_20px_rgb(0,0,0,0.04)] rounded-2xl px-5 py-5 hover:-translate-y-1 hover:shadow-lg hover:border-stone-300 transition-all duration-300 cursor-default">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">{k.label}</div>
            <div className="text-[36px] font-black text-stone-900 leading-none tracking-tight">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* By platform */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
            <i className="pi pi-chart-bar text-white/80"></i>
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Artículos por plataforma</span>
          </div>
          <div className="p-5">
            {history.length === 0 ? (
              <p className="text-sm text-[#9b9a97] py-4 text-center">Aún sin datos</p>
            ) : (
              <div className="space-y-3">
                {ALL_PLATFORMS.map(p => (
                  <div key={p}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{PLATFORMS[p].icon} {PLATFORMS[p].label}</span>
                    </div>
                    <Bar value={stats.byPlatform[p] || 0} max={maxPlatform} color={platformColors[p]} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* By month */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
            <i className="pi pi-calendar-times text-white/80"></i>
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Artículos por mes</span>
          </div>
          <div className="p-5">
            {stats.months.length === 0 ? (
              <p className="text-sm text-[#9b9a97] py-4 text-center">Aún sin datos</p>
            ) : (
              <div className="space-y-3">
                {stats.months.map(([key, count]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize">{fmtMonth(key)}</span>
                    </div>
                    <Bar value={count} max={maxMonth} color="#3b82f6" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Topics by status */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
            <i className="pi pi-tags text-white/80"></i>
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Temas por estado</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { key: 'idea',    label: 'Ideas',       color: 'bg-yellow-50 text-yellow-800 border border-yellow-200' },
              { key: 'ready',   label: 'Listos',      color: 'bg-green-50 text-green-800 border border-green-200' },
              { key: 'writing', label: 'Escribiendo', color: 'bg-blue-50 text-blue-800 border border-blue-200' },
              { key: 'done',    label: 'Hechos',      color: 'bg-gray-50 text-gray-800 border border-gray-200' },
            ].map(s => (
              <div key={s.key} className={`rounded-xl p-4 shadow-sm ${s.color}`}>
                <div className="text-[28px] font-bold tracking-tight">{stats.byStatus[s.key as keyof typeof stats.byStatus]}</div>
                <div className="text-xs mt-0.5 font-semibold text-current/80 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Highlights */}
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
            <i className="pi pi-star text-white/80"></i>
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Highlights</span>
          </div>
          <div className="space-y-4 p-5">
            {stats.bestMonth && (
              <div className="flex items-start gap-4">
                <span className="text-2xl mt-0.5">📅</span>
                <div>
                  <div className="text-sm font-semibold text-[#191919]">Mes más productivo</div>
                  <div className="text-xs text-[#9b9a97] mt-0.5">{fmtMonth(stats.bestMonth[0])} — {stats.bestMonth[1]} artículo{stats.bestMonth[1] !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}
            {(() => {
              const topPlat = ALL_PLATFORMS.reduce((a, b) => (stats.byPlatform[a] || 0) >= (stats.byPlatform[b] || 0) ? a : b)
              return stats.byPlatform[topPlat] > 0 ? (
                <div className="flex items-start gap-4">
                  <span className="text-2xl mt-0.5">{PLATFORMS[topPlat].icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-[#191919]">Plataforma favorita</div>
                    <div className="text-xs text-[#9b9a97] mt-0.5">{PLATFORMS[topPlat].label} — {stats.byPlatform[topPlat]} artículos</div>
                  </div>
                </div>
              ) : null
            })()}
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">✍️</span>
              <div>
                <div className="text-sm font-semibold text-[#191919]">Promedio por artículo</div>
                <div className="text-xs text-[#9b9a97] mt-0.5">
                  {history.length > 0 ? Math.round(stats.totalWords / history.length).toLocaleString() : 0} palabras
                </div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">🎯</span>
              <div>
                <div className="text-sm font-semibold text-[#191919]">Temas completados</div>
                <div className="text-xs text-[#9b9a97] mt-0.5">
                  {topics.length > 0 ? Math.round((stats.byStatus.done / topics.length) * 100) : 0}% del banco
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {history.length > 0 && (
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm mt-4">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center gap-2">
            <i className="pi pi-history text-white/80"></i>
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Actividad reciente</span>
          </div>
          <div>
            {[...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(h => (
              <div key={h.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#f0f0f0] last:border-0 hover:bg-[#f7f7f5] transition-colors">
                <span className="text-xs text-[#9b9a97] min-w-[72px] font-mono">{fmtDate(h.date)}</span>
                <span className="text-sm font-medium flex-1 truncate text-[#37352f]">{h.topic}</span>
                <div className="flex gap-1">{h.platforms.map(p => <span key={p} title={PLATFORMS[p].label}>{PLATFORMS[p].icon}</span>)}</div>
                <span className="text-xs font-medium text-[#9b9a97]">{(h.wordCount || 0).toLocaleString()} pal.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Artículos generados', value: history.length,           color: 'text-black' },
          { label: 'Palabras totales',    value: stats.totalWords.toLocaleString(), color: 'text-green-700' },
          { label: 'Temas en banco',      value: topics.length,            color: 'text-[#191919]' },
          { label: 'Días con contenido',  value: stats.activeDays,         color: 'text-[#2d6fa4]' },
        ].map(k => (
          <div key={k.label} className="card p-5">
            <div className={`text-3xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-[#9b9a97] mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* By platform */}
        <div className="card p-5">
          <h2 className="font-bold text-base mb-4">📊 Artículos por plataforma</h2>
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

        {/* By month */}
        <div className="card p-5">
          <h2 className="font-bold text-base mb-4">📅 Artículos por mes</h2>
          {stats.months.length === 0 ? (
            <p className="text-sm text-[#9b9a97] py-4 text-center">Aún sin datos</p>
          ) : (
            <div className="space-y-3">
              {stats.months.map(([key, count]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium capitalize">{fmtMonth(key)}</span>
                  </div>
                  <Bar value={count} max={maxMonth} color="#c9963a" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Topics by status */}
        <div className="card p-5">
          <h2 className="font-bold text-base mb-4">💡 Temas por estado</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'idea',    label: 'Ideas',       color: 'bg-yellow-100 text-yellow-800' },
              { key: 'ready',   label: 'Listos',      color: 'bg-green-100 text-green-800' },
              { key: 'writing', label: 'Escribiendo', color: 'bg-blue-100 text-blue-800' },
              { key: 'done',    label: 'Hechos',      color: 'bg-gray-100 text-gray-600' },
            ].map(s => (
              <div key={s.key} className={`rounded-lg p-4 ${s.color}`}>
                <div className="text-[28px] font-bold tracking-tight text-black">{stats.byStatus[s.key as keyof typeof stats.byStatus]}</div>
                <div className="text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Highlights */}
        <div className="card p-5">
          <h2 className="font-bold text-base mb-4">🏆 Highlights</h2>
          <div className="space-y-3">
            {stats.bestMonth && (
              <div className="flex items-start gap-2">
                <span className="text-lg">📅</span>
                <div>
                  <div className="text-sm font-medium">Mes más productivo</div>
                  <div className="text-xs text-[#9b9a97]">{fmtMonth(stats.bestMonth[0])} — {stats.bestMonth[1]} artículo{stats.bestMonth[1] !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}
            {(() => {
              const topPlat = ALL_PLATFORMS.reduce((a, b) => (stats.byPlatform[a] || 0) >= (stats.byPlatform[b] || 0) ? a : b)
              return stats.byPlatform[topPlat] > 0 ? (
                <div className="flex items-start gap-2">
                  <span className="text-lg">{PLATFORMS[topPlat].icon}</span>
                  <div>
                    <div className="text-sm font-medium">Plataforma favorita</div>
                    <div className="text-xs text-[#9b9a97]">{PLATFORMS[topPlat].label} — {stats.byPlatform[topPlat]} artículos</div>
                  </div>
                </div>
              ) : null
            })()}
            <div className="flex items-start gap-2">
              <span className="text-lg">✍️</span>
              <div>
                <div className="text-sm font-medium">Promedio por artículo</div>
                <div className="text-xs text-[#9b9a97]">
                  {history.length > 0 ? Math.round(stats.totalWords / history.length).toLocaleString() : 0} palabras
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-lg">🎯</span>
              <div>
                <div className="text-sm font-medium">Temas completados</div>
                <div className="text-xs text-[#9b9a97]">
                  {topics.length > 0 ? Math.round((stats.byStatus.done / topics.length) * 100) : 0}% del banco
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {history.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="font-bold text-base mb-4">🕐 Actividad reciente</h2>
          <div className="space-y-2">
            {[...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(h => (
              <div key={h.id} className="flex items-center gap-3 py-1.5 border-b border-[#e9e9e7] last:border-0">
                <span className="text-xs text-[#9b9a97] min-w-[72px]">{fmtDate(h.date)}</span>
                <span className="text-sm flex-1 truncate">{h.topic}</span>
                <div className="flex gap-1">{h.platforms.map(p => <span key={p} title={PLATFORMS[p].label}>{PLATFORMS[p].icon}</span>)}</div>
                <span className="text-xs text-[#9b9a97]">{(h.wordCount || 0).toLocaleString()} pal.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

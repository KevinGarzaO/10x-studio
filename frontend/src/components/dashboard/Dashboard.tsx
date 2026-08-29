'use client'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS } from '@/types'
import { fmtDate, dateStr } from '@/lib/utils'

export function Dashboard({ onNav }: { onNav: (s: any) => void }) {
  const { topics, history, calendar } = useApp()
  const today = dateStr()
  const pending = calendar.filter(e => e.status === 'pending')
  const published = calendar.filter(e => e.status === 'published')
  const upcoming = [...pending].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  const ready = topics.filter(t => t.status === 'ready').slice(0, 5)
  const recent = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  // Calculate count values dynamically
  const getRecentCount = (list: { created?: string; date?: string }[], days: number) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return list.filter(item => {
      const dateVal = item.created || item.date
      if (!dateVal) return false
      return new Date(dateVal) >= cutoff
    }).length
  }

  const recentTopicsCount = getRecentCount(topics, 7)
  const recentHistoryCount = getRecentCount(history, 30)

  const stats = [
    {
      label: 'Temas en banco',
      value: topics.length,
      delta: `+${recentTopicsCount} esta semana`,
      positive: recentTopicsCount > 0,
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.08)',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Artículos generados',
      value: history.length,
      delta: `+${recentHistoryCount} este mes`,
      positive: recentHistoryCount > 0,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.08)',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Publicaciones agendadas',
      value: pending.length,
      delta: upcoming.length > 0 ? `Próxima: ${fmtDate(upcoming[0].date)}` : 'Sin programar',
      positive: upcoming.length > 0,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.08)',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Publicados',
      value: published.length,
      delta: 'Total histórico',
      positive: false,
      color: '#0ea5e9',
      bg: 'rgba(14,165,233,0.08)',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ]

  const priorityLabels: Record<number, string> = { 1: 'Alta', 2: 'Media', 3: 'Baja' }

  return (
    <div className="px-8 py-7 animate-fadein" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1.1 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
            Buen día, Kevin. Aquí está el resumen de tu estrategia de contenido.
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: '#fff', border: '1px solid var(--border)', fontSize: 12.5, color: '#64748b' }}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Agosto 2026
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-5 transition-all duration-200"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
          >
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 12.5, fontWeight: 500, color: '#64748b' }}>{s.label}</span>
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ width: 34, height: 34, background: s.bg, color: s.color }}
              >
                {s.icon}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: '#0d1117', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11.5, color: s.positive ? '#10b981' : '#94a3b8', marginTop: 6, fontWeight: 500 }}>
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Upcoming */}
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>Próximas publicaciones</div>
            <button
              onClick={() => onNav('calendar')}
              style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Ver calendario
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {upcoming.length ? upcoming.map(e => {
              const t = topics.find(topic => topic.id === e.topicId)
              const formattedDate = fmtDate(e.date)
              const dateParts = formattedDate.split(' ')
              const day = dateParts[0] || ''
              const month = (dateParts[1] || '').replace('.', '').toUpperCase()

              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#f8f9fb', border: '1px solid #f1f5f9' }}>
                  <div
                    className="flex-shrink-0 rounded-lg flex flex-col items-center justify-center"
                    style={{ width: 40, height: 40, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                  >
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{day}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{month}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0d1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t?.title || 'Sin tema'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{e.date}</span>
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          background: e.platform.includes('substack') ? 'rgba(239,68,68,0.1)' : e.platform.includes('linkedin') ? 'rgba(14,165,233,0.1)' : 'rgba(168,85,247,0.1)',
                          color: e.platform.includes('substack') ? '#ef4444' : e.platform.includes('linkedin') ? '#0ea5e9' : '#a855f7'
                        }}
                      >
                        {PLATFORMS[e.platform]?.label || e.platform}
                      </span>
                    </div>
                  </div>
                </div>
              )
            }) : (
              <div className="py-8 text-center bg-[#f8f9fb] rounded-lg border border-[#f1f5f9]">
                <p className="text-sm text-stone-400 font-medium">Sin publicaciones agendadas</p>
                <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('calendar')}>Ir al calendario</button>
              </div>
            )}
          </div>
        </div>

        {/* Ready topics */}
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>Listos para escribir</div>
            <button
              onClick={() => onNav('topics')}
              style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Ver temas
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {ready.length ? ready.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all"
                style={{ background: '#f8f9fb', border: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f8f9fb')}
              >
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: t.priority === 1 ? '#10b981' : t.priority === 2 ? '#f59e0b' : '#94a3b8' }}
                />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: '#0d1117', lineHeight: 1.3 }}>{t.title}</div>
                  <div className="flex gap-1 mt-1">
                    {(t.tags || []).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', fontWeight: 500 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => onNav('redactor')}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg transition-all"
                  style={{ fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.08)', border: 'none', cursor: 'pointer' }}
                >
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  Escribir
                </button>
              </div>
            )) : (
              <div className="py-8 text-center bg-[#f8f9fb] rounded-lg border border-[#f1f5f9]">
                <p className="text-sm text-stone-400 font-medium">No hay temas listos</p>
                <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('topics')}>Agregar temas</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent articles */}
      <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>Últimos artículos generados</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: 6 }}>
            {history.length} total
          </span>
        </div>
        <div>
          {recent.length ? recent.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-4 px-5 py-3.5 transition-all cursor-pointer"
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0d1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.topic}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{fmtDate(h.date)}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {(h.platforms || []).map(p => (
                  <span
                    key={p}
                    className="px-2 py-1 rounded-lg text-xs font-bold"
                    style={{
                      background: p.includes('substack') ? 'rgba(239,68,68,0.1)' : p.includes('linkedin') ? 'rgba(14,165,233,0.1)' : 'rgba(168,85,247,0.1)',
                      color: p.includes('substack') ? '#ef4444' : p.includes('linkedin') ? '#0ea5e9' : '#a855f7'
                    }}
                  >
                    {PLATFORMS[p]?.label || p}
                  </span>
                ))}
              </div>
              <div className="flex-shrink-0 text-right" style={{ minWidth: 60 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1117' }}>{h.wordCount}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>palabras</div>
              </div>
            </div>
          )) : (
            <div className="py-8 text-center">
              <p className="text-sm text-stone-400 font-medium">Aún no has generado artículos</p>
              <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('redactor')}>Crear primer artículo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

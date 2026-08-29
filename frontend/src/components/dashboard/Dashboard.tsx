'use client'
import { useState } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS } from '@/types'
import { fmtDate, dateStr } from '@/lib/utils'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function Dashboard({ onNav }: { onNav: (s: any) => void }) {
  const { topics, calendar, contentStats, dashboardStats, fetchContentForMonth } = useApp()
  const today = dateStr()
  const pending = calendar.filter(e => e.status === 'pending')
  const upcoming = [...pending].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  const ready = topics.filter(t => t.status === 'ready').slice(0, 5)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  const analytics = dashboardStats?.analytics
  const byType = dashboardStats?.analytics_by_type || {}
  const content = dashboardStats?.content
  const items = content?.items || []

  function changeMonth(y: number, m: number) {
    setSelectedYear(y)
    setSelectedMonth(m)
    setShowMonthPicker(false)
    fetchContentForMonth(y, m)
  }

  const getRecentCount = (list: { created?: string; date?: string }[], days: number) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return list.filter(item => {
      const dateVal = item.created || item.date
      if (!dateVal) return false
      return new Date(dateVal) >= cutoff
    }).length
  }

  function getTypeBadge(type: string) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      blog_post: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', label: 'Blog' },
      newsletter: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', label: 'Substack' },
      linkedin_post: { bg: 'rgba(14,165,233,0.1)', color: '#0ea5e9', label: 'LinkedIn' },
      note: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Note' },
    }
    return map[type] || { bg: '#f1f5f9', color: '#64748b', label: type }
  }

  return (
    <div className="px-8 py-7 animate-fadein" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#10b981', color: '#fff' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
              Dashboard
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: '#64748b' }}>Buen día, Kevin. Aquí está el resumen de tu estrategia de contenido.</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMonthPicker(!showMonthPicker)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all hover:shadow-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', fontSize: 12.5, color: '#64748b' }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showMonthPicker && (
            <div className="absolute right-0 top-full mt-2 z-50 rounded-xl p-4 shadow-lg" style={{ background: '#fff', border: '1px solid var(--border)', minWidth: 280 }}>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => changeMonth(selectedYear - 1, selectedMonth)} className="px-2 py-1 rounded hover:bg-gray-100 text-sm font-bold" style={{ color: '#64748b' }}>‹</button>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#0d1117' }}>{selectedYear}</span>
                <button onClick={() => changeMonth(selectedYear + 1, selectedMonth)} className="px-2 py-1 rounded hover:bg-gray-100 text-sm font-bold" style={{ color: '#64748b' }}>›</button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_NAMES.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => changeMonth(selectedYear, i + 1)}
                    className="px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: (i + 1 === selectedMonth) ? '#10b981' : 'transparent',
                      color: (i + 1 === selectedMonth) ? '#fff' : '#64748b',
                    }}
                  >
                    {name.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary: Analytics Overview */}
      <div className="rounded-xl p-6 mb-5" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between mb-5">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>
            Analytics — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: 'Visitas', value: analytics?.views || 0, color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg> },
            { label: 'Visitantes únicos', value: analytics?.unique_visitors || 0, color: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8"/></svg> },
            { label: 'Scroll promedio', value: `${analytics?.avg_scroll_depth || 0}%`, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
            { label: 'Shares', value: analytics?.shares || 0, color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)', icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-5" style={{ background: '#f8f9fb', border: '1px solid #f1f5f9' }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontSize: 12.5, fontWeight: 500, color: '#64748b' }}>{s.label}</span>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: s.bg, color: s.color }}>{s.icon}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0d1117', lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Analytics by content type */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'blog_post', label: 'Blog', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
            { key: 'newsletter', label: 'Substack', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
            { key: 'linkedin_post', label: 'LinkedIn', color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)' },
          ].map(t => {
            const data = byType[t.key] || { views: 0, visitors: 0, shares: 0, likes: 0, open_rate: 0, content_count: 0 }
            return (
              <div key={t.key} className="rounded-xl p-4" style={{ background: '#f8f9fb', border: '1px solid #f1f5f9' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0d1117' }}>{t.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: t.bg, color: t.color }}>{data.content_count}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#0d1117' }}>{data.views}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>visitas</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#0d1117' }}>{data.visitors}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{t.key === 'newsletter' ? 'posts' : 'visitantes'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-heading)', color: '#0d1117' }}>
                      {t.key === 'newsletter' ? `${Math.round((data.open_rate || 0) * 100)}%` : (data.likes || data.shares || 0)}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{t.key === 'newsletter' ? 'apertura' : 'likes'}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Content by month + Upcoming side by side */}
      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Content summary */}
        <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>Contenido del mes</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: 6 }}>
              {content?.total || 0} total
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {[
              { key: 'blog_post', label: 'Blog Posts', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
              { key: 'newsletter', label: 'Newsletters', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
              { key: 'linkedin_post', label: 'LinkedIn Posts', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
              { key: 'note', label: 'Notes', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
            ].map(t => {
              const count = content?.by_type?.[t.key] || 0
              return (
                <div key={t.key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#f8f9fb', border: '1px solid #f1f5f9' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#0d1117' }}>{t.label}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: t.bg, color: t.color }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

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
                  <div className="flex-shrink-0 rounded-lg flex flex-col items-center justify-center" style={{ width: 40, height: 40, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{day}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{month}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0d1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t?.title || 'Sin tema'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{e.date}</span>
                      <span className="px-1.5 py-0.5 rounded" style={{
                        fontSize: 10, fontWeight: 600,
                        background: e.platform.includes('substack') ? 'rgba(239,68,68,0.1)' : e.platform.includes('linkedin') ? 'rgba(14,165,233,0.1)' : 'rgba(168,85,247,0.1)',
                        color: e.platform.includes('substack') ? '#ef4444' : e.platform.includes('linkedin') ? '#0ea5e9' : '#a855f7'
                      }}>
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
      </div>

      {/* Recent articles */}
      <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0d1117' }}>Últimos artículos generados</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 8px', borderRadius: 6 }}>
            {MONTH_NAMES[selectedMonth - 1]}: {items.length}
          </span>
        </div>
        <div>
          {items.slice(0, 8).map((item) => {
            const badge = getTypeBadge(item.content_type)
            const date = item.created_at ? new Date(item.created_at) : null
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-all cursor-pointer"
                onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0d1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    {date ? date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </div>
                </div>
                <span className="px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0" style={{ background: badge.bg, color: badge.color }}>
                  {badge.label}
                </span>
                {item.word_count ? (
                  <div className="flex-shrink-0 text-right" style={{ minWidth: 60 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1117' }}>{item.word_count}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>palabras</div>
                  </div>
                ) : null}
              </div>
            )
          })}
          {!items.length && (
            <div className="py-8 text-center">
              <p className="text-sm text-stone-400 font-medium">Sin contenido este mes</p>
              <button className="mt-3 text-xs font-bold text-brand-accent underline hover:brightness-110 transition-colors" onClick={() => onNav('redactor')}>Crear contenido</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

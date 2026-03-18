'use client'
import { useState } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { api } from '@/lib/api'
import { PLATFORMS, ALL_PLATFORMS, type Platform } from '@/types'
import { fmtDate } from '@/lib/utils'

interface PublishState { id: string; status: 'publishing' | 'done' | 'error'; msg?: string }

export function HistorySection({ onRewrite }: { onRewrite: (topic: string) => void }) {
  const { history, deleteHistory, substackConnected } = useApp()
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState<'all' | Platform>('all')
  const [pubState, setPubState] = useState<PublishState | null>(null)
  const [pubModal, setPubModal] = useState<{ id: string; topic: string; platform: Platform; text?: string } | null>(null)

  const filtered = [...history]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(h => {
      const matchQ = !search || h.topic.toLowerCase().includes(search.toLowerCase())
      const matchF = filter === 'all' || h.platforms.includes(filter)
      return matchQ && matchF
    })

  async function publishToSubstack(type: 'note' | 'article', content: string, title: string) {
    setPubState({ id: pubModal!.id, status: 'publishing' })
    try {
      await api('/api/substack/publish', {
        method: 'POST',
        body: JSON.stringify({ type, content, title, scheduleAt: null }),
      })
      setPubState({ id: pubModal!.id, status: 'done', msg: '✅ Publicado en Substack' })
      setPubModal(null)
      setTimeout(() => setPubState(null), 4000)
    } catch (e) {
      setPubState({ id: pubModal!.id, status: 'error', msg: `❌ ${String(e)}` })
    }
  }

  const isSubstackPlatform = (p: Platform) => p === 'substack-note' || p === 'substack-article'

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-history text-brand-secondary"></i> Historial
          </h1>
          <p className="text-sm text-brand-secondary mt-1">Todos los artículos generados</p>
        </div>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary text-sm pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input !pl-9" />
        </div>
        <div className="flex gap-2 p-1 bg-brand-surface rounded-xl border border-brand-border w-fit max-w-full overflow-x-auto no-scrollbar">
          {(['all', ...ALL_PLATFORMS] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`tab ${filter === f ? 'tab-active' : 'tab-inactive'} text-xs !h-[32px] px-3 whitespace-nowrap`}>
              {f === 'all' ? 'Todos' : PLATFORMS[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Global publish status */}
      {pubState && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${pubState.status === 'done' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : pubState.status === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-brand-surface border border-brand-border text-brand-secondary'}`}>
          {pubState.status === 'publishing' ? '⏳ Publicando en Substack...' : pubState.msg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-brand-secondary">
          <div className="text-4xl mb-3">📚</div>
          <p>Aún no tienes artículos generados.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(h => {
            const d = new Date(h.date + 'T00:00:00')
            const hasSubstack = h.platforms.some(isSubstackPlatform)
            return (
              <div key={h.id} className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 flex items-start gap-4 group hover:shadow-md hover:-translate-y-0.5 hover:border-brand-accent transition-all duration-200">
                <div className="min-w-[52px] text-center bg-brand-bg rounded-xl py-2 px-2">
                  <div className="text-xl font-black leading-none text-brand-primary">{d.getDate()}</div>
                  <div className="text-[10px] text-brand-secondary uppercase tracking-wide mt-0.5 font-bold">{d.toLocaleString('es', { month: 'short' })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm mb-1.5 truncate text-brand-primary">{h.topic}</div>
                  <div className="flex gap-1.5 flex-wrap mb-1.5">
                    {(h.platforms || []).map(p => (
                      <span key={p} className="text-xs bg-brand-bg border border-brand-border text-brand-secondary px-2 py-0.5 rounded-lg font-medium">
                        {PLATFORMS[p]?.icon} {PLATFORMS[p]?.label}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-brand-secondary">{h.wordCount ? `${h.wordCount.toLocaleString()} palabras · ` : ''}{fmtDate(h.date)}</div>
                </div>
                <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-wrap justify-end mt-2 sm:mt-0 w-full sm:w-auto border-t sm:border-0 pt-3 sm:pt-0">
                  {substackConnected && hasSubstack && (
                    <button
                      className="btn btn-secondary btn-sm text-xs h-8 flex-1 sm:flex-none justify-center"
                      onClick={() => setPubModal({ id: h.id, topic: h.topic, platform: h.platforms.find(isSubstackPlatform)! })}
                      disabled={pubState?.id === h.id && pubState.status === 'publishing'}
                    >
                      <i className="pi pi-send mr-1.5"></i>
                      Publicar
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm text-xs h-8 flex-1 sm:flex-none justify-center" onClick={() => onRewrite(h.topic)}>
                    <i className="pi pi-refresh mr-1.5"></i>
                    Regenerar
                  </button>
                  <button className="btn btn-danger btn-sm h-8 w-8 !p-0 justify-center" onClick={() => deleteHistory(h.id)}>
                    <i className="pi pi-trash text-xs"></i>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Publish modal */}
      {pubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setPubModal(null)}>
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-[var(--shadow)]">
            <h2 className="text-xl font-bold mb-1 text-brand-primary">Publicar en Substack</h2>
            <p className="text-sm text-brand-secondary mb-5 truncate">{pubModal.topic}</p>
 
            <div className="space-y-3 mb-6">
              <p className="text-sm text-brand-primary font-medium">¿Cómo quieres publicarlo?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="bg-brand-bg border border-brand-border rounded-xl p-4 text-center hover:border-brand-accent transition-all cursor-pointer group/card"
                  onClick={() => publishToSubstack('note', pubModal.topic, pubModal.topic)}
                >
                  <div className="text-2xl mb-1 group-hover/card:scale-110 transition-transform">📝</div>
                  <div className="text-sm font-semibold text-brand-primary">Nota</div>
                  <div className="text-xs text-brand-secondary">Corto, inmediato</div>
                </button>
                <button
                  className="bg-brand-bg border border-brand-border rounded-xl p-4 text-center hover:border-brand-accent transition-all cursor-pointer group/card"
                  onClick={() => publishToSubstack('article', pubModal.topic, pubModal.topic)}
                >
                  <div className="text-2xl mb-1 group-hover/card:scale-110 transition-transform">📄</div>
                  <div className="text-sm font-semibold text-brand-primary">Artículo</div>
                  <div className="text-xs text-brand-secondary">Newsletter completo</div>
                </button>
              </div>
              <p className="text-xs text-brand-secondary mt-2">
                💡 Para editar el contenido antes de publicar, ve a la sección <strong>Substack → Publicar</strong>.
              </p>
            </div>
            <button className="btn btn-secondary w-full" onClick={() => setPubModal(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

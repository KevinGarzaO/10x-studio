'use client'
import { useState } from 'react'
import { useApp } from '@/components/layout/AppProvider'
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
      const res = await fetch('/api/substack/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, title, scheduleAt: null }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
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
      <div className="flex items-end justify-between mb-8 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-history text-[#9b9a97]"></i> Historial
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Todos los artículos generados</p>
        </div>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input !pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...ALL_PLATFORMS] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${filter === f ? 'border-stone-900 text-stone-900 bg-stone-900/5 shadow-sm' : 'border-[#e9e9e7] text-[#9b9a97] hover:border-[#ccc]'}`}>
              {f === 'all' ? 'Todos' : `${PLATFORMS[f].icon} ${PLATFORMS[f].label}`}
            </button>
          ))}
        </div>
      </div>

      {/* Global publish status */}
      {pubState && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${pubState.status === 'done' ? 'bg-green-50 border border-green-200 text-green-800' : pubState.status === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-[#f7f7f5] border border-[#e9e9e7] text-[#9b9a97]'}`}>
          {pubState.status === 'publishing' ? '⏳ Publicando en Substack...' : pubState.msg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9b9a97]">
          <div className="text-4xl mb-3">📚</div>
          <p>Aún no tienes artículos generados.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(h => {
            const d = new Date(h.date + 'T00:00:00')
            const hasSubstack = h.platforms.some(isSubstackPlatform)
            return (
              <div key={h.id} className="bg-white border border-[#e9e9e7] rounded-xl px-5 py-4 flex items-start gap-4 group hover:shadow-md hover:-translate-y-0.5 hover:border-stone-300 transition-all duration-200">
                <div className="min-w-[52px] text-center bg-stone-100 rounded-xl py-2 px-2">
                  <div className="text-xl font-black leading-none text-stone-800">{d.getDate()}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wide mt-0.5 font-bold">{d.toLocaleString('es', { month: 'short' })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm mb-1.5 truncate text-stone-900">{h.topic}</div>
                  <div className="flex gap-1.5 flex-wrap mb-1.5">
                    {(h.platforms || []).map(p => (
                      <span key={p} className="text-xs bg-stone-50 border border-stone-200 text-stone-600 px-2 py-0.5 rounded-lg font-medium">
                        {PLATFORMS[p]?.icon} {PLATFORMS[p]?.label}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-[#9b9a97]">{h.wordCount ? `${h.wordCount.toLocaleString()} palabras · ` : ''}{fmtDate(h.date)}</div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap justify-end">
                  {substackConnected && hasSubstack && (
                    <button
                      className="btn btn-ghost btn-sm text-[10px]"
                      onClick={() => setPubModal({ id: h.id, topic: h.topic, platform: h.platforms.find(isSubstackPlatform)! })}
                      disabled={pubState?.id === h.id && pubState.status === 'publishing'}
                    >
                      📰 Publicar
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => onRewrite(h.topic)}>🔄 Regenerar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteHistory(h.id)}>🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Publish modal */}
      {pubModal && (
        <div className="fixed inset-0 bg-[#191919]/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setPubModal(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-1">Publicar en Substack</h2>
            <p className="text-sm text-[#9b9a97] mb-5 truncate">{pubModal.topic}</p>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-[#191919]">¿Cómo quieres publicarlo?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="card p-4 text-center hover:border-black transition-all cursor-pointer"
                  onClick={() => publishToSubstack('note', pubModal.topic, pubModal.topic)}
                >
                  <div className="text-2xl mb-1">🗒️</div>
                  <div className="text-sm font-semibold">Note</div>
                  <div className="text-xs text-[#9b9a97]">Corto, inmediato</div>
                </button>
                <button
                  className="card p-4 text-center hover:border-black transition-all cursor-pointer"
                  onClick={() => publishToSubstack('article', pubModal.topic, pubModal.topic)}
                >
                  <div className="text-2xl mb-1">📋</div>
                  <div className="text-sm font-semibold">Article</div>
                  <div className="text-xs text-[#9b9a97]">Newsletter completo</div>
                </button>
              </div>
              <p className="text-xs text-[#9b9a97] mt-2">
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

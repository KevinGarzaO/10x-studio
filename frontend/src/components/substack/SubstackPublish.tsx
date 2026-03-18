'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { uid } from '@/lib/utils'
import type { ScheduledPost } from '@/types'
import { api } from '@/lib/api'

type PublishType = 'note' | 'article'
type PublishTime = 'now' | 'schedule'

export function SubstackPublish() {
  const { history, addCalEvent } = useApp()

  const [type,        setType]        = useState<PublishType>('note')
  const [content,     setContent]     = useState('')
  const [title,       setTitle]       = useState('')
  const [subtitle,    setSubtitle]    = useState('')
  const [publishTime, setPublishTime] = useState<PublishTime>('now')
  const [scheduleAt,  setScheduleAt]  = useState('')
  const [publishing,  setPublishing]  = useState(false)
  const [result,      setResult]      = useState<{ ok: boolean; msg: string } | null>(null)
  const [queue,       setQueue]       = useState<ScheduledPost[]>([])

  const substackHistory = history.filter(h =>
    h.platforms.some(p => p === 'substack-article' || p === 'substack-note')
  ).slice(0, 10)

  // Load scheduled queue
  useEffect(() => { loadQueue() }, [])
  async function loadQueue() {
    try {
      const data = await api<ScheduledPost[]>('/api/substack/scheduled')
      setQueue(data)
    } catch { /* silent */ }
  }

  async function publish() {
    if (!content.trim()) { alert('Escribe el contenido'); return }
    if (type === 'article' && !title.trim()) { alert('Escribe el título'); return }
    if (publishTime === 'schedule' && !scheduleAt) { alert('Selecciona la fecha y hora'); return }

    setPublishing(true); setResult(null)
    try {
      const isoSchedule = publishTime === 'schedule' ? new Date(scheduleAt).toISOString() : null

      const data = await api<any>('/api/substack/publish', {
        method: 'POST',
        body: JSON.stringify({ type, content, title, subtitle, scheduleAt: isoSchedule }),
      })

      if (publishTime === 'schedule') {
        // Also save to local queue + calendar for visibility
        const post: ScheduledPost = {
          id: uid(), type, title, content,
          scheduleAt: new Date(scheduleAt).toISOString(),
          status: 'pending',
        }
        await api('/api/substack/scheduled', {
          method: 'POST',
          body: JSON.stringify(post),
        })
        await addCalEvent({
          id: uid(),
          topicId: null,
          topicTitle: title || content.slice(0, 60),
          date: scheduleAt.slice(0, 10),
          platform: type === 'note' ? 'substack-note' : 'substack-article',
          status: 'pending',
        })
        setResult({ ok: true, msg: `📅 Programado para ${new Date(scheduleAt).toLocaleString('es-MX')}` })
        loadQueue()
      } else {
        setResult({ ok: true, msg: `✅ ${type === 'note' ? 'Nota' : 'Artículo'} publicado en Substack` })
      }

      setContent(''); setTitle(''); setSubtitle('')
    } catch (e) {
      setResult({ ok: false, msg: `❌ ${String(e)}` })
    }
    setPublishing(false)
  }

  async function cancelScheduled(id: string) {
    await api('/api/substack/scheduled', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
    loadQueue()
  }

  const pendingQueue = queue.filter(p => p.status === 'pending')
  const recentQueue  = queue.filter(p => p.status !== 'pending').slice(-5)

  return (
    <div className="max-w-2xl">
      {/* Type selector */}
      <div className="flex gap-2 mb-5">
        {([['note','🗒️ Note'],['article','📋 Article']] as [PublishType,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setType(t as PublishType)}
            className={`flex-1 py-3 rounded-lg border-2 text-sm font-bold transition-all ${type === t ? 'border-brand-accent bg-brand-accent/10 text-brand-accent' : 'border-brand-border text-brand-secondary hover:border-brand-accent'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-2xl mb-5 overflow-hidden shadow-[var(--shadow)]">
        <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">Contenido</span>
          {substackHistory.length > 0 && (
            <select className="input w-52 text-xs py-1" onChange={e => {
              const entry = history.find(h => h.id === e.target.value)
              if (entry) setTitle(entry.topic)
            }}>
              <option value="">Cargar del historial...</option>
              {substackHistory.map(h => <option key={h.id} value={h.id}>{h.topic.substring(0, 45)}</option>)}
            </select>
          )}
        </div>
        <div className="p-6 space-y-4">
          {type === 'article' && (
            <>
              <div><label className="label block mb-1.5">Título *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Título del artículo" /></div>
              <div><label className="label block mb-1.5">Subtítulo</label>
                <input value={subtitle} onChange={e => setSubtitle(e.target.value)} className="input" placeholder="Subtítulo opcional" /></div>
            </>
          )}

          <div>
            <label className="label block mb-1.5">
              {type === 'note' ? 'Contenido de la nota' : 'Cuerpo del artículo'}
              {type === 'note' && <span className="ml-1 text-brand-secondary font-normal normal-case tracking-normal">— máx ~300 palabras</span>}
            </label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              rows={type === 'note' ? 5 : 12} className="input resize-none"
              placeholder={type === 'note' ? 'Escribe tu nota aquí...' : 'Contenido del artículo en markdown...'} />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-brand-secondary">{content.split(/\s+/).filter(Boolean).length} palabras</span>
              {type === 'note' && content.split(/\s+/).filter(Boolean).length > 250 && (
                <span className="text-xs text-amber-500 font-bold">⚠️ Las notas largas pueden truncarse</span>
              )}
            </div>
          </div>

          {/* Publish time */}
          <div>
            <label className="label block mb-2">Cuándo publicar</label>
            <div className="flex gap-2 mb-3">
              {([['now','⚡ Ahora'],['schedule','📅 Programar']] as [PublishTime,string][]).map(([t, label]) => (
                <button key={t} onClick={() => setPublishTime(t as PublishTime)}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all ${publishTime === t ? 'border-brand-accent text-brand-accent bg-brand-accent/10' : 'border-brand-border text-brand-secondary hover:border-brand-accent'}`}>
                  {label}
                </button>
              ))}
            </div>
            {publishTime === 'schedule' && (
              <div>
                <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                  className="input" min={new Date().toISOString().slice(0, 16)} />
                <p className="text-xs text-brand-secondary mt-1.5 leading-relaxed">El servidor publicará automáticamente en esta fecha/hora, sin que necesites tener la app abierta.</p>
              </div>
            )}
          </div>

          <button className="btn btn-primary w-full py-3" onClick={publish} disabled={publishing}>
            {publishing
              ? '⏳ Procesando...'
              : publishTime === 'now'
                ? `📤 Publicar ${type === 'note' ? 'Note' : 'Article'} ahora`
                : `📅 Programar publicación`}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-xl p-4 text-sm font-bold mb-5 shadow-sm ${result.ok ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
          {result.msg}
        </div>
      )}

      {/* Scheduled queue */}
      {pendingQueue.length > 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-2xl mb-5 overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">📅 Cola de publicaciones ({pendingQueue.length})</span>
            <button onClick={loadQueue} className="btn btn-secondary btn-sm">🔄</button>
          </div>
          <div className="divide-y divide-brand-border">
            {pendingQueue.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-brand-bg/30 transition-colors">
                <span className="text-lg">{p.type === 'note' ? '🗒️' : '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-brand-primary truncate">{p.title || p.content.slice(0, 60)}</div>
                  <div className="text-xs text-brand-secondary">{new Date(p.scheduleAt).toLocaleString('es-MX')}</div>
                </div>
                <span className="text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full font-bold">Pendiente</span>
                <button onClick={() => cancelScheduled(p.id)} className="btn btn-danger btn-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent published */}
      {recentQueue.length > 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">Publicaciones recientes</span>
          </div>
          <div className="divide-y divide-brand-border">
            {recentQueue.reverse().map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-brand-bg/30 transition-colors">
                <span className="text-lg">{p.type === 'note' ? '🗒️' : '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-brand-primary truncate">{p.title || p.content.slice(0, 60)}</div>
                  <div className="text-xs text-brand-secondary">{p.publishedAt ? new Date(p.publishedAt).toLocaleString('es-MX') : p.scheduleAt.slice(0, 10)}</div>
                </div>
                {p.status === 'published' && <span className="text-xs bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">✅ Publicado</span>}
                {p.status === 'error' && <span className="text-xs bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-bold" title={p.errorMsg}>❌ Error</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

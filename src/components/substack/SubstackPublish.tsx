'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { uid } from '@/lib/utils'
import type { ScheduledPost } from '@/types'

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
      const res = await fetch('/api/substack/scheduled')
      const data = await res.json()
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

      const res = await fetch('/api/substack/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, title, subtitle, scheduleAt: isoSchedule }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      if (publishTime === 'schedule') {
        // Also save to local queue + calendar for visibility
        const post: ScheduledPost = {
          id: uid(), type, title, content,
          scheduleAt: new Date(scheduleAt).toISOString(),
          status: 'pending',
        }
        await fetch('/api/substack/scheduled', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    await fetch('/api/substack/scheduled', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
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
            className={`flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all ${type === t ? 'border-black bg-black/[0.06] text-black' : 'border-[#e9e9e7] text-[#9b9a97] hover:border-[#e9e9e7]'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#e9e9e7] rounded-2xl mb-5 overflow-hidden shadow-sm">
        <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-white uppercase tracking-wide">Contenido</span>
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
              {type === 'note' && <span className="ml-1 text-black font-normal normal-case tracking-normal">— máx ~300 palabras</span>}
            </label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              rows={type === 'note' ? 5 : 12} className="input resize-none"
              placeholder={type === 'note' ? 'Escribe tu nota aquí...' : 'Contenido del artículo en markdown...'} />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-[#9b9a97]">{content.split(/\s+/).filter(Boolean).length} palabras</span>
              {type === 'note' && content.split(/\s+/).filter(Boolean).length > 250 && (
                <span className="text-xs text-amber-600">⚠️ Las notas largas pueden truncarse</span>
              )}
            </div>
          </div>

          {/* Publish time */}
          <div>
            <label className="label block mb-2">Cuándo publicar</label>
            <div className="flex gap-2 mb-3">
              {([['now','⚡ Ahora'],['schedule','📅 Programar']] as [PublishTime,string][]).map(([t, label]) => (
                <button key={t} onClick={() => setPublishTime(t as PublishTime)}
                  className={`px-4 py-2 rounded-lg border text-xs font-medium transition-all ${publishTime === t ? 'border-black text-black bg-black/[0.06]' : 'border-[#e9e9e7] text-[#9b9a97]'}`}>
                  {label}
                </button>
              ))}
            </div>
            {publishTime === 'schedule' && (
              <div>
                <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                  className="input" min={new Date().toISOString().slice(0, 16)} />
                <p className="text-xs text-[#9b9a97] mt-1.5">El servidor publicará automáticamente en esta fecha/hora, sin que necesites tener la app abierta.</p>
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
        <div className={`rounded-lg p-4 text-sm font-medium mb-5 ${result.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {result.msg}
        </div>
      )}

      {/* Scheduled queue */}
      {pendingQueue.length > 0 && (
        <div className="bg-white border border-[#e9e9e7] rounded-2xl mb-5 overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white uppercase tracking-wide">📅 Cola de publicaciones ({pendingQueue.length})</span>
            <button onClick={loadQueue} className="btn btn-secondary btn-sm">🔄</button>
          </div>
          <div className="divide-y divide-[#e9e9e7]">
            {pendingQueue.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-lg">{p.type === 'note' ? '🗒️' : '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.title || p.content.slice(0, 60)}</div>
                  <div className="text-xs text-[#9b9a97]">{new Date(p.scheduleAt).toLocaleString('es-MX')}</div>
                </div>
                <span className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-2 py-0.5 rounded-full">Pendiente</span>
                <button onClick={() => cancelScheduled(p.id)} className="btn btn-danger btn-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent published */}
      {recentQueue.length > 0 && (
        <div className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white uppercase tracking-wide">Publicaciones recientes</span>
          </div>
          <div className="divide-y divide-[#e9e9e7]">
            {recentQueue.reverse().map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-lg">{p.type === 'note' ? '🗒️' : '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.title || p.content.slice(0, 60)}</div>
                  <div className="text-xs text-[#9b9a97]">{p.publishedAt ? new Date(p.publishedAt).toLocaleString('es-MX') : p.scheduleAt.slice(0, 10)}</div>
                </div>
                {p.status === 'published' && <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">✅ Publicado</span>}
                {p.status === 'error' && <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full" title={p.errorMsg}>❌ Error</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

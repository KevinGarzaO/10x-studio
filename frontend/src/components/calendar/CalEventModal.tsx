'use client'
import { useState, useEffect } from 'react'
import { PLATFORMS, ALL_PLATFORMS, type CalendarEvent, type Platform, type Topic } from '@/types'

interface Props {
  open: boolean
  event: CalendarEvent | null
  defaultDate: string
  topics: Topic[]
  onClose: () => void
  onSave: (ev: Omit<CalendarEvent, 'id'>) => void
  onDelete: (id: string) => void
}

export function CalEventModal({ open, event, defaultDate, topics, onClose, onSave, onDelete }: Props) {
  const [date, setDate]         = useState('')
  const [topicId, setTopicId]   = useState('')
  const [platform, setPlatform] = useState<Platform>('blog')
  const [status, setStatus]     = useState<'pending' | 'published'>('pending')

  useEffect(() => {
    if (event) { setDate(event.date); setTopicId(event.topicId || ''); setPlatform(event.platform); setStatus(event.status) }
    else { setDate(defaultDate); setTopicId(''); setPlatform('blog'); setStatus('pending') }
  }, [event, defaultDate, open])

  if (!open) return null

  function handleSave() {
    onSave({ date, topicId: topicId || null, platform, status })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-[var(--shadow)]">
        <h2 className="text-xl font-bold mb-5 text-brand-primary">{event ? 'Editar publicación' : 'Agendar publicación'}</h2>
        <div className="space-y-4">
          <div><label className="label block mb-1.5">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" /></div>
          <div><label className="label block mb-1.5">Tema</label>
            <select value={topicId} onChange={e => setTopicId(e.target.value)} className="input">
              <option value="">— Sin tema asignado —</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select></div>
          <div><label className="label block mb-1.5">Plataforma</label>
            <select value={platform} onChange={e => setPlatform(e.target.value as Platform)} className="input">
              {ALL_PLATFORMS.map(p => <option key={p} value={p}>{PLATFORMS[p].icon} {PLATFORMS[p].label}</option>)}
            </select></div>
          <div><label className="label block mb-1.5">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'pending' | 'published')} className="input">
              <option value="pending">🕐 Por publicar</option>
              <option value="published">✅ Publicado</option>
            </select></div>
        </div>
        <div className="flex items-center justify-between mt-6">
          {event
            ? <button className="btn btn-danger btn-sm" onClick={() => onDelete(event.id)}>🗑️ Eliminar</button>
            : <div />}
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

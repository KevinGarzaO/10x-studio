'use client'
import { useState, useEffect } from 'react'
import type { Topic, TopicStatus, TopicPriority, Campaign } from '@/types'
import { PRIORITY_LABELS } from '@/types'

interface Props {
  open: boolean
  topic: Topic | null
  campaigns: Campaign[]
  onClose: () => void
  onSave: (data: Omit<Topic, 'id' | 'created'>) => void
}

export function TopicModal({ open, topic, campaigns, onClose, onSave }: Props) {
  const [title,      setTitle]      = useState('')
  const [status,     setStatus]     = useState<TopicStatus>('idea')
  const [tags,       setTags]       = useState('')
  const [notes,      setNotes]      = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [priority,   setPriority]   = useState<TopicPriority | ''>('')

  useEffect(() => {
    if (topic) {
      setTitle(topic.title); setStatus(topic.status); setTags(topic.tags.join(', '))
      setNotes(topic.notes); setCampaignId(topic.campaignId || ''); setPriority(topic.priority || '')
    } else { setTitle(''); setStatus('idea'); setTags(''); setNotes(''); setCampaignId(''); setPriority('') }
  }, [topic, open])

  if (!open) return null

  function handleSave() {
    if (!title.trim()) { alert('Escribe un título'); return }
    onSave({
      title: title.trim(), status,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      notes, campaignId: campaignId || undefined,
      priority: priority ? priority as TopicPriority : undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-[#191919]/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold mb-5">{topic ? 'Editar tema' : 'Agregar tema'}</h2>
        <div className="space-y-4">
          <div><label className="label block mb-1.5">Título *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Ej: Cómo usar la IA para crear contenido" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label block mb-1.5">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as TopicStatus)} className="input">
                <option value="idea">💡 Idea</option>
                <option value="ready">✅ Listo</option>
                <option value="writing">✏️ Escribiendo</option>
                <option value="done">✓ Hecho</option>
              </select></div>
            <div><label className="label block mb-1.5">Prioridad</label>
              <select value={priority} onChange={e => setPriority(e.target.value as TopicPriority | '')} className="input">
                <option value="">Sin prioridad</option>
                <option value="1">🔴 Alta</option>
                <option value="2">🟡 Media</option>
                <option value="3">🟢 Baja</option>
              </select></div>
          </div>
          {campaigns.length > 0 && (
            <div><label className="label block mb-1.5">Campaña</label>
              <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="input">
                <option value="">Sin campaña</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          )}
          <div><label className="label block mb-1.5">Etiquetas (separadas por coma)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} className="input" placeholder="marketing, IA, productividad" /></div>
          <div><label className="label block mb-1.5">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input resize-none h-20" placeholder="Ideas, ángulos, referencias..." /></div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

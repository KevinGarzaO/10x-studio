'use client'
import { useState, useEffect } from 'react'
import type { Campaign } from '@/types'
import { CAMPAIGN_COLORS } from '@/types'

interface Props {
  open: boolean
  campaign: Campaign | null
  onClose: () => void
  onSave: (data: Omit<Campaign, 'id' | 'created'>) => void
  onDelete?: () => void
}

export function CampaignModal({ open, campaign, onClose, onSave, onDelete }: Props) {
  const [name,  setName]  = useState('')
  const [color, setColor] = useState(CAMPAIGN_COLORS[0])
  const [desc,  setDesc]  = useState('')

  useEffect(() => {
    if (campaign) { setName(campaign.name); setColor(campaign.color); setDesc(campaign.description || '') }
    else { setName(''); setColor(CAMPAIGN_COLORS[0]); setDesc('') }
  }, [campaign, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-sm shadow-[var(--shadow)]">
        <h2 className="text-xl font-bold mb-5 text-brand-primary">{campaign ? 'Editar campaña' : 'Nueva campaña'}</h2>
        <div className="space-y-4">
          <div><label className="label block mb-1.5">Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Ej: Lanzamiento Q1, Serie IA..." autoFocus /></div>
          <div><label className="label block mb-1.5">Descripción</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} className="input" placeholder="Objetivo de esta campaña..." /></div>
          <div>
            <label className="label block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CAMPAIGN_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-brand-primary scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-6">
          {onDelete ? <button className="btn btn-danger btn-sm" onClick={onDelete}>🗑️ Eliminar</button> : <div />}
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => { if (!name.trim()) return; onSave({ name, color, description: desc }) }}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

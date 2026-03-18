'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { Topic } from '@/types'

interface Props {
  topic: Topic
  apiKey: string
  niche: string
  audience: string
  onClose: () => void
  onSave: (topicId: string, research: { researchSummary: string; seoKeyword: string; seoVolume: string }) => void
}

interface Research {
  summary: string
  angles: string[]
  keyPoints: string[]
  seoKeyword: string
  estimatedVolume: string
  competitionLevel: string
  relatedTopics: string[]
}

export function ResearchModal({ topic, apiKey, niche, audience, onClose, onSave }: Props) {
  const [loading,   setLoading]   = useState(false)
  const [research,  setResearch]  = useState<Research | null>(null)
  const [error,     setError]     = useState('')

  async function doResearch() {
    if (!apiKey) { setError('Ingresa tu API Key primero'); return }
    setLoading(true); setError('')
    try {
      const data = await api<any>('/api/suggest', {
        method: 'POST',
        body: JSON.stringify({ type: 'research', topic: topic.title, niche, audience, apiKey }),
      })
      if (data.error) throw new Error(data.error)
      setResearch(data)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  function handleSave() {
    if (!research) return
    onSave(topic.id, { researchSummary: research.summary, seoKeyword: research.seoKeyword, seoVolume: research.estimatedVolume })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-lg shadow-[var(--shadow)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-brand-primary">🔬 Investigación IA</h2>
            <p className="text-sm text-brand-secondary mt-0.5 truncate max-w-xs">{topic.title}</p>
          </div>
          <button onClick={onClose} className="text-brand-secondary hover:text-brand-primary text-xl">×</button>
        </div>

        {!research && !loading && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-brand-secondary mb-5">La IA analizará el tema y te dará ángulos, puntos clave, keyword principal y nivel de competencia SEO.</p>
            <button className="btn btn-primary" onClick={doResearch}>Investigar tema</button>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-brand-secondary">Investigando...</p>
          </div>
        )}

        {research && (
          <div className="space-y-4">
            <div className="bg-brand-bg rounded-lg p-4">
              <div className="text-xs font-semibold text-brand-secondary uppercase tracking-wider mb-1">Resumen</div>
              <p className="text-sm text-brand-primary">{research.summary}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-lg p-3 text-center">
                <div className="text-xs text-brand-accent font-semibold mb-1">Keyword</div>
                <div className="text-sm font-bold text-brand-accent">{research.seoKeyword}</div>
              </div>
              <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-lg p-3 text-center">
                <div className="text-xs text-brand-accent font-semibold mb-1">Volumen</div>
                <div className="text-sm font-bold text-brand-accent">{research.estimatedVolume}</div>
              </div>
              <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-lg p-3 text-center">
                <div className="text-xs text-brand-accent font-semibold mb-1">Competencia</div>
                <div className="text-sm font-bold text-brand-accent">{research.competitionLevel}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-brand-secondary uppercase tracking-wider mb-2">Ángulos sugeridos</div>
              <div className="space-y-1.5">
                {research.angles.map((a, i) => <div key={i} className="flex gap-2 text-sm text-brand-primary"><span className="text-brand-accent font-bold">{i + 1}.</span>{a}</div>)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-brand-secondary uppercase tracking-wider mb-2">Puntos clave a cubrir</div>
              <div className="flex flex-wrap gap-1.5">
                {research.keyPoints.map((p, i) => <span key={i} className="text-xs bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-1 rounded-full">{p}</span>)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-brand-secondary uppercase tracking-wider mb-2">Temas relacionados</div>
              <div className="flex flex-wrap gap-1.5">
                {research.relatedTopics.map((t, i) => <span key={i} className="text-xs bg-brand-bg text-brand-secondary border border-brand-border px-2 py-1 rounded-full">{t}</span>)}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-border">
              <button className="btn btn-ghost" onClick={() => setResearch(null)}>Reintentar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar en tema ✓</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

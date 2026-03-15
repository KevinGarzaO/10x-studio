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
    <div className="fixed inset-0 bg-[#191919]/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">🔬 Investigación IA</h2>
            <p className="text-sm text-[#9b9a97] mt-0.5 truncate max-w-xs">{topic.title}</p>
          </div>
          <button onClick={onClose} className="text-[#9b9a97] hover:text-[#191919] text-xl">×</button>
        </div>

        {!research && !loading && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-[#9b9a97] mb-5">La IA analizará el tema y te dará ángulos, puntos clave, keyword principal y nivel de competencia SEO.</p>
            <button className="btn btn-primary" onClick={doResearch}>Investigar tema</button>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[#9b9a97]">Investigando...</p>
          </div>
        )}

        {research && (
          <div className="space-y-4">
            <div className="bg-[#f7f7f5] rounded-lg p-4">
              <div className="text-xs font-semibold text-[#9b9a97] uppercase tracking-wider mb-1">Resumen</div>
              <p className="text-sm">{research.summary}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-blue-600 font-semibold mb-1">Keyword</div>
                <div className="text-sm font-bold text-blue-800">{research.seoKeyword}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-xs text-purple-600 font-semibold mb-1">Volumen</div>
                <div className="text-sm font-bold text-purple-800">{research.estimatedVolume}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <div className="text-xs text-orange-600 font-semibold mb-1">Competencia</div>
                <div className="text-sm font-bold text-orange-800">{research.competitionLevel}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#9b9a97] uppercase tracking-wider mb-2">Ángulos sugeridos</div>
              <div className="space-y-1.5">
                {research.angles.map((a, i) => <div key={i} className="flex gap-2 text-sm"><span className="text-black font-bold">{i + 1}.</span>{a}</div>)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#9b9a97] uppercase tracking-wider mb-2">Puntos clave a cubrir</div>
              <div className="flex flex-wrap gap-1.5">
                {research.keyPoints.map((p, i) => <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full">{p}</span>)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#9b9a97] uppercase tracking-wider mb-2">Temas relacionados</div>
              <div className="flex flex-wrap gap-1.5">
                {research.relatedTopics.map((t, i) => <span key={i} className="text-xs bg-[#e9e9e7] text-[#9b9a97] px-2 py-1 rounded-full">{t}</span>)}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#e9e9e7]">
              <button className="btn btn-secondary" onClick={() => setResearch(null)}>Reintentar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar en tema ✓</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Send, Loader2 } from 'lucide-react'

export function SubstackNotes() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const charLimit = 2000
  const remaining = charLimit - content.length

  async function publishNote() {
    if (!content.trim()) return
    setLoading(true)
    setResult(null)
    try {
      await api('/api/substack/notes', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim() })
      })
      setResult({ ok: true, msg: '✅ Nota publicada correctamente en Substack' })
      setContent('')
    } catch (err: any) {
      setResult({ ok: false, msg: `❌ Error: ${err.message || String(err)}` })
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-brand-primary">Publicar Note</h2>
            <p className="text-xs text-brand-secondary mt-0.5">Comparte una nota corta directamente en Substack</p>
          </div>
          <span className="text-xs font-bold text-brand-secondary bg-brand-bg px-3 py-1 rounded-full border border-brand-border">
            Notas
          </span>
        </div>

        {/* Text area */}
        <div className="p-6">
          <div className="relative">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, charLimit))}
              placeholder="¿Qué quieres compartir hoy?"
              rows={8}
              className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-[15px] text-brand-primary placeholder:text-brand-secondary/50 resize-none focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all leading-relaxed"
            />
            <span
              className={`absolute bottom-3 right-4 text-xs font-semibold tabular-nums transition-colors ${
                remaining < 100 ? (remaining < 20 ? 'text-red-400' : 'text-amber-400') : 'text-brand-secondary/60'
              }`}
            >
              {remaining}
            </span>
          </div>

          {/* Result message */}
          {result && (
            <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm font-medium border ${
              result.ok
                ? 'bg-green-900/20 border-green-700/40 text-green-300'
                : 'bg-red-900/20 border-red-700/40 text-red-300'
            }`}>
              {result.msg}
            </div>
          )}

          {/* Publish button */}
          <button
            onClick={publishNote}
            disabled={loading || !content.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-[#6b21a8] hover:bg-[#581c87] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-[15px] transition-colors"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Publicando...</>
            ) : (
              <><Send size={16} /> Publicar Note ahora</>
            )}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-4 bg-brand-surface/60 border border-brand-border rounded-xl p-4 text-xs text-brand-secondary leading-relaxed">
        <p className="font-semibold text-brand-primary mb-1">ℹ️ Sobre las Notas de Substack</p>
        Las Notas son publicaciones cortas visibles en el feed de tu publicación y en el perfil de Substack. Aparecen de inmediato sin necesidad de borrador o programación.
      </div>
    </div>
  )
}

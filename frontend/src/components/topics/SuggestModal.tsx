'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Loader2, Plus, PenLine, Trash2, Search, X } from 'lucide-react'

// The format returned by our backend
interface WebSuggestion {
  titulo: string
  descripcion: string
  por_que: string
}

interface Props {
  apiKey: string
  open: boolean
  onClose: () => void
  onWrite: (title: string, notes: string) => void
  onSave: (title: string, notes: string) => void
}

export function SuggestModal({ apiKey, open, onClose, onWrite, onSave }: Props) {
  const [userInput, setUserInput] = useState('')
  const [loading, setLoading]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')
  const [results, setResults]     = useState<WebSuggestion[]>([])

  if (!open) return null

  async function handleSearch() {
    const query = userInput.trim()
    if (!query) return
    
    setLoading(true)
    setErrorMsg('')
    setResults([])

    try {
      const data = await api<any>('/api/suggest/web', {
        method: 'POST',
        body: JSON.stringify({ userInput: query, apiKey }),
      })
      if (data.error) throw new Error(data.error)
      if (Array.isArray(data.temas)) {
        setResults(data.temas)
      } else {
        throw new Error('Formato de respuesta inválido')
      }
    } catch (e: any) {
      setErrorMsg(e.message || String(e))
    }
    setLoading(false)
  }

  function handleDiscard(index: number) {
    setResults(prev => prev.filter((_, i) => i !== index))
  }

  function handleSave(item: WebSuggestion, index: number) {
    onSave(item.titulo, `${item.descripcion}\n\nPor qué: ${item.por_que}`)
    handleDiscard(index)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadein">
      <div className="bg-brand-bg border border-brand-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-surface">
          <div>
            <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
              <span className="text-xl">🔍</span> Tendencias Web con IA
            </h2>
            <p className="text-xs text-brand-secondary mt-1">Busca en internet ideas relevantes para publicar</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-bg rounded-lg text-brand-secondary hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Search Box */}
          <div className="mb-6">
            <label className="text-sm font-bold text-brand-primary mb-2 block">¿Sobre qué quieres publicar?</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={18} />
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  placeholder="ej: inteligencia artificial para negocios"
                  className="input !pl-10 w-full"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button 
                onClick={handleSearch} 
                disabled={loading || !userInput.trim()} 
                className="btn btn-primary h-[42px] px-6"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Buscar temas'}
              </button>
            </div>
            {errorMsg && <p className="text-red-400 text-sm mt-3 bg-red-900/20 p-3 rounded-xl border border-red-900/50">{errorMsg}</p>}
          </div>

          {/* Results Area */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-brand-secondary">
              <Loader2 size={40} className="animate-spin mb-4 text-brand-accent" />
              <p className="font-semibold text-brand-primary">Buscando en internet...</p>
              <p className="text-sm mt-1">Claude está analizando las tendencias recientes</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-brand-secondary uppercase tracking-widest px-1">
                Resultados encontrados
              </div>
              {results.map((item, i) => (
                <div key={i} className="bg-brand-surface border border-brand-border rounded-xl p-5 hover:border-brand-accent/50 transition-colors group">
                  <h3 className="text-[16px] font-bold text-brand-primary mb-2 leading-tight">{item.titulo}</h3>
                  <div className="space-y-3 mb-5">
                    <p className="text-sm text-brand-secondary leading-relaxed bg-brand-bg p-3 rounded-lg border border-brand-border/50">
                      <span className="font-semibold text-brand-primary mb-1 block">📝 Descripción:</span>
                      {item.descripcion}
                    </p>
                    <p className="text-sm text-brand-secondary leading-relaxed bg-brand-bg p-3 rounded-lg border border-brand-border/50">
                      <span className="font-semibold text-brand-accent mb-1 block">💡 Por qué ahora:</span>
                      {item.por_que}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-border">
                    <button 
                      onClick={() => onWrite(item.titulo, `${item.descripcion}\n\nContexto: ${item.por_que}`)}
                      className="flex-1 btn bg-brand-accent hover:opacity-90 text-black justify-center font-bold"
                    >
                      <PenLine size={16} /> Redactar
                    </button>
                    <button 
                      onClick={() => handleSave(item, i)}
                      className="flex-1 btn border border-brand-border bg-brand-surface hover:bg-brand-bg text-brand-primary justify-center"
                    >
                      <Plus size={16} /> Guardar
                    </button>
                    <button 
                      onClick={() => handleDiscard(i)}
                      className="btn border border-red-900/30 bg-red-900/10 hover:bg-red-900/20 text-red-400 justify-center px-4"
                      title="Eliminar sugerencia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

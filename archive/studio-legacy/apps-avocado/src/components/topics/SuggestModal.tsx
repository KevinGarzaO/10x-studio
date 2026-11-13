'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Loader2, Plus, PenLine, Trash2, Search, X } from 'lucide-react'
import Swal from 'sweetalert2'

const AvocadoAlert = Swal.mixin({
  background: '#ffffff',
  color: '#0d1117',
  customClass: {
    popup: 'border border-gray-200 rounded-2xl shadow-2xl',
    confirmButton: 'btn btn-primary px-6 h-10',
    cancelButton: 'btn btn-secondary px-6 h-10'
  },
  buttonsStyling: false
})

// The format returned by our backend
interface WebSuggestion {
  titulo: string
  descripcion: string
  por_que: string
  relevancia: number
}

interface Props {
  apiKey: string
  open: boolean
  initialQuery?: string
  minRelevance?: number
  onClose: () => void
  onWrite: (title: string, notes: string) => void
  onSave: (title: string, notes: string) => void
}

export function SuggestModal({ apiKey, open, initialQuery, minRelevance = 0, onClose, onWrite, onSave }: Props) {
  const [userInput, setUserInput] = useState('')
  const [loading, setLoading]     = useState(false)
  const [results, setResults]     = useState<WebSuggestion[]>([])

  // Ensure initialQuery triggers search once when modal opens
  useEffect(() => {
    if (open && initialQuery && initialQuery.trim() !== '') {
      setUserInput(initialQuery)
      handleAutomatedSearch(initialQuery)
    } else if (open) {
      setUserInput('')
      setResults([])
    }
  }, [open, initialQuery])

  if (!open) return null

  async function handleAutomatedSearch(query: string) {
    if (!query.trim() || loading) return
    setLoading(true)
    setResults([])

    try {
      const data = await api<any>('/api/suggest/web', {
        method: 'POST',
        body: JSON.stringify({ userInput: query.trim(), apiKey }),
      })
      if (data.error) throw new Error(data.error)
      if (Array.isArray(data.temas)) {
        // Ordenar de mayor a menor relevancia, tipear numéricamente y aplicar filtro de minRelevance
        const sorted = data.temas
          .map((t: any) => ({
            ...t, 
            relevancia: typeof t.relevancia === 'number' ? t.relevancia : (parseInt(t.relevancia) || 50)
          }))
          .filter((t: any) => t.relevancia >= minRelevance)
          .sort((a: any, b: any) => b.relevancia - a.relevancia)
        setResults(sorted)
      } else {
        throw new Error('Formato de respuesta inválido')
      }
    } catch (e: any) {
      AvocadoAlert.fire({
        icon: 'error',
        title: 'Error de Búsqueda Web',
        text: e.message || String(e),
        confirmButtonColor: '#ff4d4d'
      })
    }
    setLoading(false)
  }

  function handleSearch() {
    handleAutomatedSearch(userInput)
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
              <i className="fa-solid fa-magnifying-glass"></i> Tendencias Web con IA
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
                <div key={i} className="bg-brand-surface border border-brand-border rounded-xl p-5 hover:border-brand-accent/50 transition-colors group relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-full w-1 flex flex-col justify-end bg-black/40">
                    <div 
                      className={`w-full transition-all duration-1000 ${
                        item.relevancia >= 90 ? 'bg-brand-accent shadow-[0_0_15px_rgba(78,204,163,0.6)]' : 
                        item.relevancia >= 70 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ height: `${item.relevancia}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-start mb-2 pr-4">
                    <h3 className="text-[16px] font-bold text-brand-primary leading-tight">{item.titulo}</h3>
                    <div className="flex flex-col items-center ml-2 flex-shrink-0 bg-brand-bg rounded-lg border border-brand-border px-2 py-1">
                      <span className="text-[10px] uppercase text-brand-secondary font-bold tracking-wider mb-0.5">Viralidad</span>
                      <div className="flex items-center gap-1">
                        <i className={`pi pi-bolt text-xs ${item.relevancia >= 90 ? 'text-brand-accent' : item.relevancia >= 70 ? 'text-yellow-400' : 'text-red-400'}`}></i>
                        <span className={`text-sm font-bold ${item.relevancia >= 90 ? 'text-brand-accent' : 'text-brand-primary'}`}>{item.relevancia}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 mb-5 pr-4">
                    <p className="text-sm text-brand-secondary leading-relaxed bg-brand-bg p-3 rounded-lg border border-brand-border/50">
                      <span className="font-semibold text-brand-primary mb-1 block"><i className="fa-solid fa-pen"></i> Descripción:</span>
                      {item.descripcion}
                    </p>
                    <p className="text-sm text-brand-secondary leading-relaxed bg-brand-bg p-3 rounded-lg border border-brand-border/50">
                      <span className="font-semibold text-brand-accent mb-1 block"><i className="fa-solid fa-lightbulb"></i> Por qué ahora:</span>
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

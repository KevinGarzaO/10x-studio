'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/components/layout/AppProvider'
import { uid, dateStr } from '@/lib/utils'

interface Props { prefill?: { title?: string; notes?: string } | null; onNav?: (section: string) => void }
type ContentPlatform = 'article' | 'note'

const LENGTH_OPTIONS = [
  { label: 'Corto ~500', value: '500' },
  { label: 'Medio ~1000', value: '1000' },
  { label: 'Largo ~1500', value: '1500' }
]

const TONE_OPTIONS = [
  { label: 'Conversacional', value: 'Conversacional' },
  { label: 'Profesional', value: 'Profesional' },
  { label: 'Inspiracional', value: 'Inspiracional' }
]

export function RedactorSection({ prefill, onNav }: Props) {
  const { settings, addHistory, addTopic, topics, updateTopic, setEditorPrefill } = useApp()

  const [platform, setPlatform] = useState<ContentPlatform>('article')
  const [topic, setTopic]       = useState('')
  const [length, setLength]     = useState('1000') // default Medio
  const [tone, setTone]         = useState('Conversacional')
  
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSug, setShowSug]   = useState(false)

  const lastPrefill = useRef<typeof prefill>(null)
  useEffect(() => {
    if (prefill && prefill !== lastPrefill.current) {
      lastPrefill.current = prefill
      if (prefill.title) setTopic(prefill.title)
    }
  }, [prefill])

  async function handleSuggest() {
    if (!settings.apiKey) { alert('Ingresa tu API Key de OpenAI / Anthropic en Configuración'); return }
    try {
      const data = await api<any>('/api/suggest', { method: 'POST',
        body: JSON.stringify({ type: 'topics', niche: settings.niche, audience: settings.audience, existing: [], apiKey: settings.apiKey }) })
      setSuggestions(data.topics.map((t: { title: string }) => t.title)); setShowSug(true)
    } catch (e) { console.error(e) }
  }

  async function generate() {
    if (!topic.trim()) { alert('Escribe un tema'); return }
    setGenerating(true)

    try {
      const data = await api<any>('/api/generate/substack', { 
        method: 'POST',
        body: JSON.stringify({ 
          topic, 
          platform, 
          length, 
          tone 
        }) 
      })
      
      if (data.error) throw new Error(data.error)
      
      const { titulo, subtitulo, contenido, contenido_raw } = data

      // Save to history/topics
      const wordCount = typeof contenido === 'string' ? contenido.split(/\s+/).length : JSON.stringify(contenido).split(/\s+/).length // approx
      const matchedTopic = topics.find(t => t.title.toLowerCase() === topic.trim().toLowerCase())
      await addHistory({ id: uid(), topic: topic.trim(), topicId: matchedTopic?.id ?? null, platforms: [platform === 'article' ? 'substack-article' : 'substack-note'], date: dateStr(), wordCount })
      if (matchedTopic) await updateTopic({ ...matchedTopic, status: 'done' })
      else await addTopic({ id: uid(), title: topic.trim(), status: 'done', tags: [], notes: '', created: dateStr() })

      // Send to Editor and Navigate
      let autoDraftId = null
      if (platform === 'article') {
        try {
          const draftRes = await api<any>('/api/substack/drafts/create', { 
            method: 'POST', 
            body: JSON.stringify({ 
              draft_title: titulo || 'Sin título', 
              draft_subtitle: subtitulo || '', 
              draft_body: '' 
            }) 
          })
          if (draftRes && draftRes.id) autoDraftId = String(draftRes.id)
        } catch (err) {
          console.error('Error al autoguardar el borrador preliminar', err)
        }
      }

      setEditorPrefill({ type: platform, content: platform === 'note' ? contenido_raw : contenido, title: titulo, subtitle: subtitulo, draftId: autoDraftId })
      if (onNav) onNav('substack-dash')

    } catch (e: any) {
      alert(`Error al generar: ${e.message || String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-sparkles text-brand-accent"></i> Redactor IA
          </h1>
          <p className="text-sm text-brand-secondary mt-1">Genera borradores para Substack directamente listos para publicar</p>
        </div>
      </div>

      <div className="card mb-5">
        <div className="panel-header-dark">
          <span className="text-xs font-semibold text-white uppercase tracking-wide flex items-center gap-2">
            <i className="pi pi-bolt"></i>
            Configuración de IA
          </span>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Platform selection */}
          <div>
            <label className="label block mb-3">PLATAFORMAS <span className="text-[#9b9a97] font-normal normal-case tracking-normal">— selecciona una</span></label>
            <div className="flex gap-4">
              <button 
                onClick={() => setPlatform('article')}
                className={`flex-1 relative border-2 rounded-xl py-4 px-2 flex flex-col items-center gap-2 transition-all duration-200 ${platform === 'article' ? 'border-brand-accent bg-brand-accent/5 shadow-sm' : 'border-brand-border bg-brand-bg hover:border-brand-accent hover:shadow-sm'}`}>
                <span className={`absolute top-2 right-2 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${platform === 'article' ? 'bg-brand-accent border-brand-accent text-black shadow-sm' : 'bg-brand-surface border-brand-border text-transparent'}`}><i className="pi pi-check text-[9px]"></i></span>
                <span className="text-3xl drop-shadow-sm">📰</span>
                <span className={`text-[13px] font-bold ${platform === 'article' ? 'text-brand-accent' : 'text-brand-primary'}`}>Substack Artículo</span>
              </button>
              <button 
                onClick={() => setPlatform('note')}
                className={`flex-1 relative border-2 rounded-xl py-4 px-2 flex flex-col items-center gap-2 transition-all duration-200 ${platform === 'note' ? 'border-brand-accent bg-brand-accent/5 shadow-sm' : 'border-brand-border bg-brand-bg hover:border-brand-accent hover:shadow-sm'}`}>
                <span className={`absolute top-2 right-2 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${platform === 'note' ? 'bg-brand-accent border-brand-accent text-black shadow-sm' : 'bg-brand-surface border-brand-border text-transparent'}`}><i className="pi pi-check text-[9px]"></i></span>
                <span className="text-3xl drop-shadow-sm">📝</span>
                <span className={`text-[13px] font-bold ${platform === 'note' ? 'text-brand-accent' : 'text-brand-primary'}`}>Substack Note</span>
              </button>
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="label block mb-2">TEMA DEL ARTÍCULO</label>
            <div className="flex gap-2">
              <div className="relative w-full">
                <i className="pi pi-pencil absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
                <input 
                  type="text"
                  value={topic} 
                  onChange={e => setTopic(e.target.value)} 
                  className="input !pl-9" 
                  placeholder="Ej: Cómo usar IA para crecer tu negocio" 
                />
              </div>
              <button className="btn w-32 border border-brand-border bg-brand-surface hover:bg-brand-bg/80 text-brand-primary transition-colors text-sm h-[42px] font-medium rounded-xl" onClick={handleSuggest}>
                Sugerir
              </button>
            </div>
            {showSug && suggestions.length > 0 && (
              <div className="bg-brand-surface rounded-xl p-3 mt-3 flex flex-wrap gap-2 animate-fadein">
                {suggestions.map(s => (
                  <button key={s} onClick={() => { setTopic(s); setShowSug(false) }}
                    className="text-xs bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 font-medium hover:bg-brand-accent hover:text-black hover:border-brand-accent transition-all">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label block mb-2">TONO</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className="input !bg-brand-surface border-brand-border">
                {TONE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-2">EXTENSIÓN</label>
              <select value={length} onChange={e => setLength(e.target.value)} className="input !bg-brand-surface border-brand-border">
                {LENGTH_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <button 
              className="w-full text-base font-bold py-4 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:transform-none bg-brand-accent hover:opacity-90 text-black flex items-center justify-center gap-2" 
              onClick={generate} 
              disabled={generating}
            >
              {generating ? (
                <><i className="pi pi-spin pi-spinner"></i> Generando borrador...</>
              ) : (
                <><i className="pi pi-bolt"></i> Generar {platform === 'article' ? 'Artículo' : 'Note'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

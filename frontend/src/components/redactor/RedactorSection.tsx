'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS, ALL_PLATFORMS, type Platform, type GeneratedResult } from '@/types'
import { uid, dateStr } from '@/lib/utils'
import { ResultTabs } from './ResultTabs'

interface Props { prefill?: { title?: string; notes?: string } | null }
type RedactorMode = 'generate' | 'revise' | 'compare'

const LENGTH_OPTIONS = [
  { label: '~800 palabras', value: '800' },
  { label: '~1200 palabras', value: '1200' },
  { label: '~1500 palabras', value: '1500' },
  { label: '~2000 palabras', value: '2000' },
];

const TONE_OPTIONS = [
  { label: 'Informativo', value: 'informativo' },
  { label: 'Conversacional', value: 'conversacional' },
  { label: 'Profesional', value: 'profesional' },
  { label: 'Inspirador', value: 'inspirador' },
];

const LANG_OPTIONS = [
  { label: '🇺🇸 Inglés', value: 'inglés' },
  { label: '🇲🇽 Español', value: 'español' },
  { label: '🇧🇷 Portugués', value: 'portugués' },
  { label: '🇫🇷 Francés', value: 'francés' },
];

export function RedactorSection({ prefill }: Props) {
  const { settings, addHistory, addTopic, topics, updateTopic, templates } = useApp()

  const [mode,    setMode]    = useState<RedactorMode>('generate')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(new Set<Platform>(['blog']))
  const [topic,    setTopic]    = useState('')
  const [extract,  setExtract]  = useState('')
  const [length,   setLength]   = useState('1500')
  const [tone,     setTone]     = useState('conversacional')
  const [audience, setAudience] = useState('')
  const [keywords, setKeywords] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [results,  setResults]  = useState<GeneratedResult[]>([])
  const [results2, setResults2] = useState<GeneratedResult[]>([])
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSug, setShowSug]   = useState(false)
  const [translateText, setTranslateText] = useState('')
  const [targetLang,    setTargetLang]    = useState('inglés')
  const [translated,    setTranslated]    = useState('')
  const [translating,   setTranslating]   = useState(false)
  const [transOpen, setTransOpen] = useState(false)

  const lastPrefill = useRef<typeof prefill>(null)
  useEffect(() => {
    if (prefill && prefill !== lastPrefill.current) {
      lastPrefill.current = prefill
      if (prefill.title) setTopic(prefill.title)
      if (prefill.notes) setExtract(prefill.notes)
      setResults([]); setResults2([])
    }
  }, [prefill])

  function togglePlatform(p: Platform) {
    setSelectedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(p)) { if (next.size === 1) return prev; next.delete(p) } else next.add(p)
      return next
    })
  }

  async function handleSuggest() {
    if (!settings.apiKey) { alert('Ingresa tu API Key'); return }
    try {
      const data = await api<any>('/api/suggest', { method: 'POST',
        body: JSON.stringify({ type: 'topics', niche: settings.niche, audience: settings.audience, existing: [], apiKey: settings.apiKey }) })
      setSuggestions(data.topics.map((t: { title: string }) => t.title)); setShowSug(true)
    } catch (e) { console.error(e) }
  }

  async function runGenerate(targetResults: 'results' | 'results2') {
    if (!settings.apiKey) { alert('Ingresa tu API Key'); return }
    if (!topic.trim()) { alert('Escribe un tema'); return }
    const platforms = Array.from(selectedPlatforms)
    const setter = targetResults === 'results' ? setResults : setResults2
    setter(platforms.map(p => ({ platform: p, text: '', status: 'loading' })))
    const selectedTemplate = templates.find(t => t.id === templateId)
    let totalWords = 0
    await Promise.all(platforms.map(async p => {
      try {
        const data = await api<any>('/api/generate', { method: 'POST',
          body: JSON.stringify({ topic, platform: p, length, tone, audience, keywords, extract, apiKey: settings.apiKey, customPrompt: selectedTemplate?.systemPrompt }) })
        if (data.error) throw new Error(data.error)
        const wordCount = data.text.split(/\s+/).length; totalWords += wordCount
        setter(prev => prev.map(r => r.platform === p ? { platform: p, text: data.text, status: 'done', wordCount } : r))
      } catch (e) {
        setter(prev => prev.map(r => r.platform === p ? { platform: p, text: '', status: 'error', error: String(e) } : r))
      }
    }))
    return totalWords
  }

  async function generate() {
    setGenerating(true); setResults2([])
    const totalWords = await runGenerate('results') ?? 0
    const matchedTopic = topics.find(t => t.title.toLowerCase() === topic.trim().toLowerCase())
    await addHistory({ id: uid(), topic: topic.trim(), topicId: matchedTopic?.id ?? null, platforms: Array.from(selectedPlatforms), date: dateStr(), wordCount: Math.round(totalWords / Math.max(selectedPlatforms.size, 1)) })
    if (matchedTopic) await updateTopic({ ...matchedTopic, status: 'done' })
    else await addTopic({ id: uid(), title: topic.trim(), status: 'done', tags: [], notes: extract, created: dateStr() })
    setGenerating(false)
  }

  async function generateCompare() {
    setGenerating(true)
    await Promise.all([runGenerate('results'), runGenerate('results2')])
    setGenerating(false)
  }

  async function handleRevise() {
    if (!extract.trim()) { alert('Pega el texto a revisar'); return }
    setGenerating(true)
    const platform = Array.from(selectedPlatforms)[0]
    setResults([{ platform, text: '', status: 'loading' }])
    try {
      const data = await api<any>('/api/generate', { method: 'POST',
        body: JSON.stringify({ topic, platform, length, tone, audience, keywords, extract, apiKey: settings.apiKey, mode: 'revise' }) })
      if (data.error) throw new Error(data.error)
      setResults([{ platform, text: data.text, status: 'done', wordCount: data.text.split(/\s+/).length }])
    } catch (e) {
      setResults([{ platform, text: '', status: 'error', error: String(e) }])
    }
    setGenerating(false)
  }

  async function handleTranslate() {
    if (!translateText.trim()) { alert('Pega el texto a traducir'); return }
    setTranslating(true); setTranslated('')
    try {
      const data = await api<any>('/api/generate', { method: 'POST',
        body: JSON.stringify({ topic: '', platform: 'blog', length: '1500', tone: 'conversacional', extract: translateText, apiKey: settings.apiKey, mode: 'translate', targetLang }) })
      if (data.error) throw new Error(data.error)
      setTranslated(data.text)
    } catch (e) { alert(String(e)) }
    setTranslating(false)
  }

  const n = selectedPlatforms.size
  const singlePlatform = Array.from(selectedPlatforms)[0]
  const btnLabel = n === 1 ? `Generar ${PLATFORMS[singlePlatform].label}` : `Generar ${n} versiones`

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-file-edit text-[#9b9a97]"></i> Redactor
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Genera, revisa y traduce contenido con IA</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-[#f1f1ef] rounded-md p-1 mb-5 w-fit">
        {([['generate','✦ Generar'],['revise','🔄 Revisar'],['compare','⚖️ Comparar']] as [RedactorMode,string][]).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-all ${mode === m ? 'bg-white text-black shadow-sm' : 'text-[#9b9a97] hover:text-[#37352f]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Translator collapsible */}
      <div className="bg-white border border-[#e9e9e7] rounded-xl mb-4 overflow-hidden shadow-sm">
        <button className="w-full px-5 py-4 flex items-center justify-between text-sm font-bold text-[#37352f] hover:bg-[#f7f7f5] transition-colors"
          onClick={() => setTransOpen(v => !v)}>
          <span>🌐 Traductor (ES ↔ EN)</span>
          <i className={`text-[#9b9a97] pi ${transOpen ? 'pi-chevron-up' : 'pi-chevron-down'} text-xs`}></i>
        </button>
        {transOpen && (
          <div className="px-5 pb-5 border-t border-[#e9e9e7] pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="label block mb-1.5">Texto original</label>
                <textarea
                  value={translateText} 
                  onChange={e => setTranslateText(e.target.value)} 
                  rows={6} 
                  className="input resize-y" 
                  placeholder="Pega aquí el texto..." 
                />
              </div>
              <div>
                <label className="label block mb-1.5">Traducción</label>
                <div className="w-full !rounded-xl border border-[#e9e9e7] bg-[#f7f7f5] p-3 text-sm min-h-[138px] overflow-y-auto">
                  {translating ? <span className="text-[#9b9a97] animate-pulse flex items-center gap-2"><i className="pi pi-spin pi-spinner"></i> Traduciendo...</span> : (translated || <span className="text-[#9b9a97]">La traducción aparecerá aquí</span>)}
                </div>
              </div>
            </div>
              <div className="flex items-center gap-3">
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="input w-48">
                {LANG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleTranslate} disabled={translating}>
                {translating ? '⏳ Traduciendo...' : '🌐 Traducir'}
              </button>
              {translated && <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(translated)}>Copiar</button>}
            </div>
          </div>
        )}
      </div>

      {/* Config card */}
      <div className="bg-white border border-[#e9e9e7] rounded-xl mb-5 overflow-hidden shadow-sm">
        <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-white uppercase tracking-wide flex items-center gap-2">
            <i className={`pi ${mode === 'generate' ? 'pi-sparkles' : mode === 'revise' ? 'pi-sync' : 'pi-clone'}`}></i>
            {mode === 'generate' ? 'Configuración' : mode === 'revise' ? 'Texto a revisar' : 'Comparar dos versiones'}
          </span>
          {templates.length > 0 && mode === 'generate' && (
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="text-xs bg-[#2a2a2a] border border-[#444] text-[#ccc] rounded-lg px-2 py-1.5 w-52 focus:outline-none"
            >
              <option value="">Prompt estándar</option>
              {templates.map(t => <option key={t.id} value={t.id}>{PLATFORMS[t.platform].icon} {t.name}</option>)}
            </select>
          )}
        </div>
        
        <div className="p-6 space-y-6">
          {/* Platforms */}
          <div>
            <label className="label block mb-3">Plataformas <span className="text-[#9b9a97] font-normal normal-case tracking-normal">— selecciona una o varias</span></label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {ALL_PLATFORMS.map(p => {
                const sel = selectedPlatforms.has(p)
                return (
                  <button key={p} onClick={() => togglePlatform(p)}
                    className={`relative border-2 rounded-xl py-4 px-2 flex flex-col items-center gap-1.5 transition-all duration-200 ${sel ? 'border-amber-500 bg-amber-50/50 shadow-sm' : 'border-[#e9e9e7] bg-white hover:border-[#ccc] hover:shadow-sm'}`}>
                    <span className={`absolute top-2 right-2 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${sel ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-[#f1f1ef] border-[#e9e9e7] text-transparent'}`}><i className="pi pi-check text-[9px]"></i></span>
                    <span className="text-2xl drop-shadow-sm">{PLATFORMS[p].icon}</span>
                    <span className={`text-[11px] font-bold ${sel ? 'text-amber-900' : 'text-[#37352f]'}`}>{PLATFORMS[p].label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="label block mb-2">Tema del artículo</label>
            <div className="flex gap-2">
              <div className="relative w-full">
                <i className="pi pi-pencil absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
                <input 
                  type="text"
                  value={topic} 
                  onChange={e => setTopic(e.target.value)} 
                  className="input !pl-9" 
                  placeholder="Ej: Cómo mejorar la productividad en el trabajo remoto" 
                />
              </div>
              <button className="btn btn-ghost whitespace-nowrap" onClick={handleSuggest}>✦ Sugerir</button>
            </div>
            {showSug && suggestions.length > 0 && (
              <div className="bg-[#f1f1ef] rounded-xl p-3 mt-3 flex flex-wrap gap-2 animate-fadein">
                {suggestions.map(s => (
                  <button key={s} onClick={() => { setTopic(s); setShowSug(false) }}
                    className="text-xs bg-white border border-[#e9e9e7] rounded-lg px-3 py-1.5 font-medium hover:bg-stone-900 hover:text-white hover:border-stone-900 hover:shadow-md transition-all">{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* Extract */}
          <div>
            <label className="label block mb-2">
              {mode === 'revise' ? 'Texto a mejorar *' : 'Contexto / Extracto'}
              <span className="text-[#9b9a97] ml-1 font-normal normal-case tracking-normal">{mode === 'revise' ? '— pega el texto original' : '— opcional'}</span>
            </label>
            <textarea 
              value={extract} 
              onChange={e => setExtract(e.target.value)} 
              rows={4} 
              className="input resize-y"
              placeholder={mode === 'revise' ? 'Pega aquí el texto que quieres mejorar...' : 'Notas, ideas, borradores previos...'} 
            />
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200/60">
            <div>
              <label className="label block mb-2">Extensión</label>
              <select value={length} onChange={e => setLength(e.target.value)} className="input">
                <option value="800">~800 palabras</option>
                <option value="1200">~1200 palabras</option>
                <option value="1500">~1500 palabras</option>
                <option value="2000">~2000 palabras</option>
              </select>
            </div>
            <div>
              <label className="label block mb-2">Tono</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className="input">
                <option value="informativo">Informativo</option>
                <option value="conversacional">Conversacional</option>
                <option value="profesional">Profesional</option>
                <option value="inspirador">Inspirador</option>
              </select>
            </div>
            <div>
              <label className="label block mb-2">Audiencia</label>
              <div className="relative w-full">
                <i className="pi pi-users absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
                <input
                  type="text"
                  value={audience} 
                  onChange={e => setAudience(e.target.value)} 
                  className="input !pl-9" 
                  placeholder="Emprendedores..." 
                />
              </div>
            </div>
            <div>
              <label className="label block mb-2">Palabras clave SEO</label>
              <div className="relative w-full">
                <i className="pi pi-tags absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
                <input
                  type="text"
                  value={keywords} 
                  onChange={e => setKeywords(e.target.value)} 
                  className="input !pl-9" 
                  placeholder="productividad..." 
                />
              </div>
            </div>
          </div>

          {mode === 'generate' && (
            <button className="btn btn-primary w-full py-3 text-sm" onClick={generate} disabled={generating}>
              {generating ? '⏳ Generando...' : `▶ ${btnLabel}`}
            </button>
          )}
          {mode === 'revise' && (
            <button className="btn btn-primary w-full py-3 text-sm" onClick={handleRevise} disabled={generating} style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
              {generating ? '⏳ Revisando...' : '🔄 Mejorar texto'}
            </button>
          )}
          {mode === 'compare' && (
            <button className="btn btn-primary w-full py-3 text-sm" onClick={generateCompare} disabled={generating} style={{ background: '#e11d48', borderColor: '#e11d48' }}>
              {generating ? '⏳ Generando...' : '⚖️ Generar y comparar'}
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {mode === 'compare' && (results.length > 0 || results2.length > 0) ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2"><div className="text-xs font-bold text-[#9b9a97] uppercase tracking-widest pl-1">Versión A</div><ResultTabs results={results} topic={topic} /></div>
          <div className="space-y-2"><div className="text-xs font-bold text-[#9b9a97] uppercase tracking-widest pl-1">Versión B</div><ResultTabs results={results2} topic={topic} /></div>
        </div>
      ) : results.length > 0 ? (
        <ResultTabs results={results} topic={topic} />
      ) : null}
    </div>
  )
}

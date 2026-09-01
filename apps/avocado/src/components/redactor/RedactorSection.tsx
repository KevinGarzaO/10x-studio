'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/components/layout/AppProvider'
import { uid, dateStr } from '@/lib/utils'
import { Platform } from '@/types'
import Swal from 'sweetalert2'
import { SuggestModal } from '../topics/SuggestModal'

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

interface Props { prefill?: { title?: string; notes?: string } | null; onNav?: (section: any) => void }
type ContentPlatform = 'article' | 'note' | 'linkedin-post' | 'web-post'
type ContentTone = 'Informativo' | 'Conversacional' | 'Persuasivo' | 'Educativo' | 'Inspiracional'
type ContentLength = '500' | '1000' | '2000'

const PLATFORMS: { id: ContentPlatform; label: string; desc: string; color: string; icon: JSX.Element }[] = [
  {
    id: 'article', label: 'Substack Artículo', desc: 'Artículo largo + 1000 palabras',
    color: '#ff6347',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
        <path d="M8 10h8"/><path d="M8 14h5"/>
      </svg>
    )
  },
  {
    id: 'note', label: 'Substack Note', desc: 'Nota corta - viral',
    color: '#3b82f6',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    )
  },
  {
    id: 'linkedin-post', label: 'LinkedIn Post', desc: 'Post profesional',
    color: '#0077b5',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
        <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
      </svg>
    )
  },
  {
    id: 'web-post', label: 'Blog Web', desc: 'Artículo para tu sitio',
    color: '#8b5cf6',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    )
  }
]

const TONES: ContentTone[] = ['Informativo', 'Conversacional', 'Persuasivo', 'Educativo', 'Inspiracional']
const LENGTHS: { id: ContentLength; label: string; detail: string }[] = [
  { id: '500', label: 'Corto', detail: '500 palabras' },
  { id: '1000', label: 'Medio', detail: '1000 palabras' },
  { id: '2000', label: 'Largo', detail: '2000+ palabras' }
]

export function RedactorSection({ prefill, onNav }: Props) {
  const { settings, addHistory, addTopic, topics, updateTopic, setEditorPrefill } = useApp()

  const [platform, setPlatform] = useState<ContentPlatform>('article')
  const [topic, setTopic]       = useState('')
  const [extract, setExtract]   = useState('')
  const [tone, setTone]         = useState<ContentTone>('Conversacional')
  const [length, setLength]     = useState<ContentLength>('1000')

  const [generating, setGenerating] = useState(false)
  const [showSugModal, setShowSugModal] = useState(false)

  const lastPrefill = useRef<typeof prefill>(null)
  useEffect(() => {
    if (prefill && prefill !== lastPrefill.current) {
      lastPrefill.current = prefill
      if (prefill.title) setTopic(prefill.title)
      if (prefill.notes) setExtract(prefill.notes)
    }
  }, [prefill])

  function handleSuggest() {
    setShowSugModal(true)
  }

  function handleSuggestWrite(title: string, notes: string) {
    setTopic(title)
    setExtract(notes)
    setShowSugModal(false)
  }

  function handleSuggestSave(title: string, notes: string) {
    addTopic({ id: uid(), title, status: 'idea', tags: [], notes, created: dateStr() })
    Swal.fire({
      icon: 'success',
      title: 'Tema Guardado',
      text: 'Se ha agregado exitosamente a tu Banco de Temas',
      toast: true,
      position: 'bottom-end',
      showConfirmButton: false,
      timer: 3000
    })
  }

  async function generate() {
    if (!topic.trim()) {
      AvocadoAlert.fire({
        icon: 'error',
        title: 'Campo vacío',
        text: 'Por favor, escribe o elige un tema válido primero.',
        confirmButtonColor: '#ff4d4d'
      })
      return
    }

    setGenerating(true)

    try {
      const isBlog = platform === 'web-post'

      const endpoint = isBlog ? '/api/blog/generate' : '/api/generate/substack'
      const body: Record<string, any> = { topic, tone, extract, length }
      if (!isBlog) body.platform = platform

      const data = await api<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      })

      if (data.error) throw new Error(data.error)

      const { titulo, subtitulo, contenido, contenido_raw, imageUrl: generatedImageUrl } = data

      const wordCount = typeof contenido === 'string' ? contenido.split(/\s+/).length : JSON.stringify(contenido).split(/\s+/).length
      const matchedTopic = topics.find(t => t.title.toLowerCase() === topic.trim().toLowerCase())

      const platformKey: Platform = isBlog ? 'blog' : platform === 'article' ? 'substack-article' : platform === 'note' ? 'substack-note' : 'linkedin-post'
      await addHistory({
        id: uid(),
        topic: topic.trim(),
        topicId: matchedTopic?.id ?? null,
        platforms: [platformKey],
        date: dateStr(),
        wordCount
      })
      if (matchedTopic) await updateTopic({ ...matchedTopic, status: 'done' })
      else await addTopic({ id: uid(), title: topic.trim(), status: 'done', tags: [], notes: '', created: dateStr() })

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

      setEditorPrefill({
        type: platform === 'web-post' ? 'article' : platform,
        content: (platform === 'note' || platform === 'linkedin-post') ? contenido_raw : contenido,
        title: titulo,
        subtitle: subtitulo,
        draftId: autoDraftId,
        imageUrl: generatedImageUrl
      })

      if (platform === 'linkedin-post') {
        if (onNav) onNav('li-dash')
      } else if (platform === 'web-post') {
        if (onNav) onNav('web')
      } else {
        if (onNav) onNav('substack-dash')
      }

    } catch (e: any) {
      AvocadoAlert.fire({
        icon: 'error',
        title: 'Error de generación',
        text: e.message || String(e),
        confirmButtonColor: '#ff4d4d'
      })
    } finally {
      setGenerating(false)
    }
  }

  const selectedPlatform = PLATFORMS.find(p => p.id === platform)!

  return (
    <div className="px-8 py-7" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#8b5cf6', color: '#fff' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M12 3L4 9v12h16V9l-8-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M9.5 15.5l1.5-4 1.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M17 3l1 3-3-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
            Redactor IA
          </h1>
        </div>
        <p style={{ fontSize: 13.5, color: '#64748b' }}>Genera contenido de alta calidad en segundos</p>
      </div>

      {/* Two-column: 50/50 */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left — Form */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Platform */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
            <label style={labelStyle}>Plataforma</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {PLATFORMS.map(p => {
                const isActive = platform === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    style={{
                      padding: '16px 10px', borderRadius: 12,
                      border: isActive ? `2px solid ${p.color}` : '1px solid #e2e8f0',
                      background: isActive ? `${p.color}08` : '#fff',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      cursor: 'pointer', transition: 'all 0.15s', position: 'relative'
                    }}
                  >
                    <span style={{ color: isActive ? p.color : '#94a3b8', transition: 'color 0.15s' }}>{p.icon}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: '#0d1117', lineHeight: 1.2 }}>{p.label}</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>{p.desc}</span>
                    {isActive && (
                      <span style={{ position: 'absolute', bottom: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Topic */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
            <label style={labelStyle}>Tema del artículo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </span>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Ej: Cómo usar IA para crecer tu negocio"
                  style={inputStyle}
                />
              </div>
              <button onClick={handleSuggest} style={suggestBtnStyle}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Sugerir
              </button>
            </div>
          </div>

          {/* Tono + Extensión row */}
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Tono */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, flex: 1 }}>
              <label style={labelStyle}>Tono</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TONES.map(t => (
                  <button key={t} onClick={() => setTone(t)} style={{
                    padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                    background: tone === t ? '#10b981' : '#f1f5f9',
                    color: tone === t ? '#fff' : '#475569'
                  }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Extensión */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, flex: 1 }}>
              <label style={labelStyle}>Extensión</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {LENGTHS.map(l => (
                  <button key={l.id} onClick={() => setLength(l.id)} style={{
                    padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'var(--font-body)', fontSize: 13, transition: 'all 0.15s',
                    background: length === l.id ? '#f0fdf4' : 'transparent',
                    color: length === l.id ? '#10b981' : '#475569',
                    fontWeight: length === l.id ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 10
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%',
                      border: length === l.id ? '2px solid #10b981' : '2px solid #cbd5e1',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {length === l.id && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />}
                    </span>
                    {l.label} <span style={{ color: '#94a3b8', fontSize: 12 }}>({l.detail})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Resumen base */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
            <label style={labelStyle}>Resumen base <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— Opcional</span></label>
            <textarea
              value={extract}
              onChange={e => setExtract(e.target.value)}
              rows={4}
              placeholder="Si utilizaste 'Sugerir', aquí se pegará el resumen técnico de internet automáticamente..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontFamily: 'var(--font-body)', fontSize: 13, color: '#0d1117', background: '#fff', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Generate button */}
          <button onClick={generate} disabled={generating} style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            cursor: generating ? 'not-allowed' : 'pointer',
            background: generating ? '#e2e8f0' : '#f1f5f9',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
            color: generating ? '#94a3b8' : '#475569',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {generating ? 'Generando...' : 'Generar artículo'}
          </button>
        </div>

        {/* Right — Preview (50%) */}
        <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 80 }}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, minHeight: 500, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: '#0d1117', margin: '0 0 20px 0' }}>Vista previa</h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.4 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#94a3b8', margin: 0 }}>Tu artículo aparecerá aquí</p>
            </div>
          </div>
        </div>
      </div>

      <SuggestModal
        open={showSugModal}
        initialQuery={topic}
        apiKey={settings.apiKey}
        onClose={() => setShowSugModal(false)}
        onWrite={handleSuggestWrite}
        onSave={handleSuggestSave}
      />
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: '#94a3b8',
  letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 12
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid #e2e8f0',
  fontFamily: 'var(--font-body)', fontSize: 13, color: '#0d1117', background: '#fff',
  outline: 'none', boxSizing: 'border-box'
}

const suggestBtnStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff',
  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: '#0d1117',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
}

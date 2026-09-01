'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/layout/AppProvider'
import { api } from '@/lib/api'
import Swal from 'sweetalert2'

const AvocadoAlert = Swal.mixin({
  background: '#ffffff',
  color: '#0d1117',
  confirmButtonColor: '#10b981',
  iconColor: '#10b981',
})

type LinkedInTab = 'post' | 'stats'

export function LinkedInSection() {
  const router = useRouter()
  const { settings, saveSettings, editorPrefill, setEditorPrefill } = useApp()
  const [tab, setTab]           = useState<LinkedInTab>('post')
  const [text, setText]         = useState('')
  const [charCount, setCharCount] = useState(0)
  const MAX_CHARS = 3000
  const [loading, setLoading]   = useState(false)
  const [image, setImage]       = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  
  const [posts, setPosts] = useState<any[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const handleChange = (val: string) => {
    if (val.length <= MAX_CHARS) {
      setText(val)
      setCharCount(val.length)
    }
  }
  
  const getBackendUrl = () => {
    const rawUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    return rawUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')
  }
  const backendUrl = getBackendUrl()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editorPrefill && (editorPrefill.type === 'linkedin-post' || editorPrefill.type === 'linkedin-article')) {
      setTab('post')
      let content = editorPrefill.content
      if (typeof content !== 'string') {
        content = content.text || content.contenido || JSON.stringify(content)
      }
      setText(content)
      if (editorPrefill.imageUrl) {
        setImage(editorPrefill.imageUrl)
      }
      setEditorPrefill(null)
    }
  }, [editorPrefill, setEditorPrefill])

  const [imgError, setImgError] = useState(false)
  
  useEffect(() => {
    setImgError(false)
  }, [settings.linkedinPhoto])

  const isConnected = !!settings.linkedinToken

  async function handlePublish() {
    if (!text.trim()) return AvocadoAlert.fire({ icon: 'warning', title: 'Texto vacío', text: 'Escribe el contenido del post antes de publicar.' })
    if (!isConnected) return AvocadoAlert.fire({ icon: 'warning', title: 'LinkedIn no conectado', text: 'Ve a Configuración y conecta tu cuenta de LinkedIn primero.' })

    setLoading(true)
    try {
      const isBase64 = image?.startsWith('data:image')
      const data = await api<any>('/api/linkedin/post', {
        method: 'POST',
        body: JSON.stringify({ 
          token: settings.linkedinToken, 
          urn: settings.linkedinUrn, 
          text: text.trim(),
          imageBase64: isBase64 ? image?.split(',')[1] : null,
          imageUrl: !isBase64 ? image : null,
          scheduledAt: scheduledDate || null
        })
      })
      if (data.success) {
        const isScheduled = !!scheduledDate
        await AvocadoAlert.fire({ 
          icon: 'success', 
          title: isScheduled ? '¡Programado! ⏰' : '¡Publicado! 🎉', 
          text: isScheduled ? `Tu post se publicará el ${new Date(scheduledDate).toLocaleString()}` : `Tu post ya está en LinkedIn. ID: ${data.postId}` 
        })
        setText('')
        setImage(null)
        setScheduledDate('')
      } else {
        throw new Error(data.error || 'Error desconocido')
      }
    } catch (e: any) {
      AvocadoAlert.fire({ icon: 'error', title: 'Error al publicar', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  function handleImageClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      setImage(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function fetchStats() {
    setStatsLoading(true)
    try {
      const data = await api<any>('/api/linkedin/posts')
      if (data.posts) {
        setPosts(data.posts)
      }
    } catch (e) {
      console.error('Error fetching LinkedIn stats:', e)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'stats' && isConnected) {
      fetchStats()
    }
  }, [tab, isConnected])

  // Not Connected State
  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto py-10 animate-fadein">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#0A66C2', color: '#fff' }}>
            <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
              <circle cx="4" cy="4" r="2"/>
            </svg>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary mb-2">Conectar LinkedIn</h1>
          <p className="text-brand-secondary text-sm leading-relaxed">
            Conecta tu cuenta profesional para publicar directamente desde Avocado Studio.
          </p>
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="bg-brand-surface border-b border-brand-border px-5 py-3">
            <span className="text-xs font-bold text-brand-primary uppercase tracking-wide">Cómo conectar</span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { n: '1', t: 'Ve a Configuración', d: 'Abre la sección de LinkedIn en Configuración y presiona "Conectar LinkedIn".' },
              { n: '2', t: 'Autoriza la App', d: 'Completa la autorización OAuth de LinkedIn de forma segura.' },
              { n: '3', t: 'Genera contenido', d: 'Usa el Redactor IA para crear posts virales optimizados para LinkedIn.' },
            ].map(step => (
              <div key={step.n} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-brand-accent text-[#1A1A1A] text-sm font-bold flex items-center justify-center flex-shrink-0">{step.n}</div>
                <div>
                  <div className="text-sm font-bold text-brand-primary">{step.t}</div>
                  <div className="text-xs text-brand-secondary mt-0.5 leading-relaxed">{step.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => router.push('/settings#linkedin')} className="btn btn-primary w-full shadow-lg flex items-center justify-center gap-2">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
            <circle cx="4" cy="4" r="2"/>
          </svg>
          Ir a Configuración
        </button>
      </div>
    )
  }

  return (
    <div className="px-8 py-7" style={{ maxWidth: 1100 }}>
      {/* Title */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#0ea5e9', color: '#fff' }}>
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
                <circle cx="4" cy="4" r="2"/>
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
              LinkedIn Studio
            </h1>
          </div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Gestión de presencia profesional
          </p>
        </div>
      </div>

      {/* Verified Profile card */}
      <div
        className="flex items-center gap-4 p-5 rounded-xl mb-6"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <div className="relative flex-shrink-0 w-14 h-14">
          {settings.linkedinPhoto && !imgError ? (
            <img 
              src={`${backendUrl}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`} 
              alt={settings.linkedinName}
              className="w-full h-full rounded-full object-cover border-2 border-white shadow-md" 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0A66C2] to-[#004182] flex items-center justify-center text-white font-bold text-xl shadow-md">
              {(settings.linkedinName || 'L')[0].toUpperCase()}
            </div>
          )}
          <div className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
            style={{ width: 18, height: 18, background: '#10b981', border: '2px solid #fff' }}>
            <svg width="8" height="8" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="flex-1">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0d1117' }}>{settings.linkedinName || 'Kevin Garza'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', letterSpacing: '0.02em' }}>PERFIL PROFESIONAL VERIFICADO</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#64748b' }}>
              <div className="rounded-full" style={{ width: 6, height: 6, background: '#10b981' }}/>
              Sesión Activa
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Impresiones totales', value: '4,230' },
          { label: 'Reacciones',          value: '167' },
          { label: 'Comentarios',         value: '41' },
          { label: 'Posts publicados',    value: posts.length || '3' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#0d1117' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: '#f1f5f9', display: 'inline-flex' }}>
        {([
          ['post',     'Crear Post'],
          ['stats',    'Historial'],
        ] as [LinkedInTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-2 rounded-lg capitalize transition-all border-none"
            style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0d1117' : '#94a3b8',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'post' && (
        <div className="rounded-xl p-5 relative overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white overflow-hidden shadow-sm">
              {settings.linkedinPhoto && !imgError ? (
                <img 
                  src={`${backendUrl}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`}
                  alt="Me" 
                  className="w-full h-full object-cover" 
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="font-bold text-lg">{(settings.linkedinName || 'U')[0].toUpperCase()}</span>
              )}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#0d1117' }}>{settings.linkedinName || 'Kevin Garza'}</div>
              <div className="flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded-full"
                style={{ background: '#f1f5f9', display: 'inline-flex', fontSize: 11, color: '#64748b' }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 3c-2.5 3-4 5.7-4 9s1.5 6 4 9M12 3c2.5 3 4 5.7 4 9s-1.5 6-4 9M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Cualquiera ▾
              </div>
            </div>
          </div>

          <textarea
            value={text}
            onChange={e => handleChange(e.target.value)}
            placeholder="¿Sobre qué te gustaría hablar? Comparte tu experiencia, insights o ideas..."
            rows={7}
            style={{ width: '100%', background: '#fafbfc', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0d1117', outline: 'none', resize: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#0ea5e9')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />

          {image && (
            <div className="relative mt-4 rounded-xl overflow-hidden group shadow-md border border-brand-border">
              <img 
                src={image.startsWith('http') ? (image.includes('proxy-image') ? image : `${backendUrl}/api/linkedin/proxy-image?url=${encodeURIComponent(image)}`) : image} 
                alt="Preview" 
                className="w-full max-h-[300px] object-cover" 
              />
              <button 
                onClick={() => setImage(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500 transition-colors border border-white/20 cursor-pointer"
              >
                <i className="pi pi-times text-xs"></i>
              </button>
            </div>
          )}

          {/* Schedule Overlay */}
          {showSchedule && (
            <div className="mt-4 p-4 rounded-lg bg-[#f8f9fb] border border-brand-border flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#0d1117] flex items-center gap-2">
                  <i className="pi pi-calendar-plus text-orange-400"></i> Programar Publicación
                </span>
                <button onClick={() => setShowSchedule(false)} className="text-brand-secondary hover:text-[#0d1117] border-none bg-transparent cursor-pointer"><i className="pi pi-times"></i></button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="date" 
                  value={scheduledDate ? scheduledDate.split('T')[0] : ''}
                  onChange={e => {
                    const timePart = scheduledDate ? scheduledDate.split('T')[1] || '12:00' : '12:00'
                    setScheduledDate(e.target.value ? `${e.target.value}T${timePart}` : '')
                  }}
                  className="input !h-10 flex-1 px-3 border border-brand-border rounded-lg bg-white"
                />
                <select 
                  value={scheduledDate ? (scheduledDate.split('T')[1] || '12:00') : '12:00'}
                  onChange={e => {
                    const datePart = scheduledDate ? scheduledDate.split('T')[0] : new Date().toISOString().split('T')[0]
                    setScheduledDate(`${datePart}T${e.target.value}`)
                  }}
                  className="input !h-10 w-full sm:w-32 bg-white text-[#0d1117] px-2 border border-brand-border rounded-lg"
                >
                  {Array.from({ length: 96 }).map((_, i) => {
                    const h = Math.floor(i / 4).toString().padStart(2, '0')
                    const m = (i % 4 * 15).toString().padStart(2, '0')
                    const timeStr = `${h}:${m}`
                    return <option key={timeStr} value={timeStr}>{timeStr}</option>
                  })}
                </select>
                <button onClick={() => setShowSchedule(false)} className="btn btn-primary px-6 h-10">Confirmar</button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              <button onClick={handleImageClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border border-brand-border bg-[#f8f9fb] text-[#64748b] hover:bg-stone-100 cursor-pointer" title="Cargar Imagen">
                📷 Imagen
              </button>
              <button onClick={() => setShowSchedule(!showSchedule)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border border-brand-border cursor-pointer ${showSchedule ? 'text-orange-500 bg-orange-50' : 'bg-[#f8f9fb] text-[#64748b] hover:bg-stone-100'}`} title="Programar">
                🗓️ Programar
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${charCount > MAX_CHARS * 0.85 ? 'text-orange-500' : 'text-brand-secondary'}`}>
                {charCount}/{MAX_CHARS}
              </span>
              {scheduledDate && (
                <span className="text-[11px] text-orange-400 font-bold uppercase tracking-tighter animate-pulse">
                   ⏰ {new Date(scheduledDate).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button 
                onClick={handlePublish}
                disabled={loading || !text.trim()}
                className="px-4 py-2 rounded-lg text-white transition-all border-none"
                style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-heading)', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', cursor: loading || !text.trim() ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Publicando...' : (scheduledDate ? 'Programar' : 'Publicar ahora')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, color: '#0d1117' }}>Historial de Publicaciones</h3>
            <button onClick={fetchStats} disabled={statsLoading} className="btn btn-secondary btn-sm h-8 px-3 font-bold">
              <i className={`pi pi-sync mr-1 ${statsLoading ? 'pi-spin' : ''}`}></i>
              Actualizar
            </button>
          </div>

          <div className="space-y-4">
            {posts.length > 0 ? posts.map((p) => (
              <div key={p.post_id} className="bg-white border border-brand-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white overflow-hidden shadow-sm">
                    {settings.linkedinPhoto && !imgError ? (
                      <img 
                        src={`${backendUrl}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`}
                        alt="Me" 
                        className="w-full h-full object-cover" 
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <span className="font-bold">{(settings.linkedinName || 'U')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#0d1117' }}>{settings.linkedinName || 'Kevin Garza'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {new Date(p.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: '#0d1117', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {p.text}
                </div>
                <div className="mt-4 pt-3 border-t border-[#f8f9fb] flex justify-between items-center text-xs text-[#94a3b8]">
                  <span>ID: {p.post_id.split(':').pop()}</span>
                  <div className="flex gap-4">
                    <span>👁️ 0 impresiones</span>
                    <span>❤️ 0 reacciones</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="bg-white border border-brand-border rounded-xl p-16 text-center flex flex-col items-center justify-center text-[#94a3b8]">
                {statsLoading ? (
                  <p>Consultando historial local...</p>
                ) : (
                  <>
                    <i className="pi pi-inbox text-3xl mb-2"></i>
                    <p>Aún no hay publicaciones registradas en tu historial.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

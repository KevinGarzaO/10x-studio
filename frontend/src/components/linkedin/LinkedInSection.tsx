'use client'
import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { api } from '@/lib/api'
import Swal from 'sweetalert2'

const AvocadoAlert = Swal.mixin({
  background: '#1A1A1A',
  color: '#E8E8E8',
  confirmButtonColor: '#4ECCA3',
  iconColor: '#4ECCA3',
})

type LinkedInTab = 'post' | 'stats'

export function LinkedInSection() {
  const { settings, saveSettings, editorPrefill, setEditorPrefill } = useApp()
  const [tab, setTab]           = useState<LinkedInTab>('post')
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [image, setImage]       = useState<string | null>(null) // URL or Base64
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  
  const [posts, setPosts] = useState<any[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  
  // Clean Backend URL for Production (prevents /api/api substitution)
  const getBackendUrl = () => {
    let url = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    return url.endsWith('/api') ? url.slice(0, -4) : url
  }
  const backendUrl = getBackendUrl()
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prefill check
  useEffect(() => {
    if (editorPrefill && (editorPrefill.type === 'linkedin-post' || editorPrefill.type === 'linkedin-article')) {
      setTab('post')
      let content = editorPrefill.content
      if (typeof content !== 'string') {
        content = content.text || content.contenido || JSON.stringify(content)
      }
      setText(content)
      
      // Handle Image from AI
      if (editorPrefill.imageUrl) {
        setImage(editorPrefill.imageUrl)
      }
      
      setEditorPrefill(null)
    }
  }, [editorPrefill, setEditorPrefill])

  const [imgError, setImgError] = useState(false)
  const isConnected = !!settings.linkedinToken

  // Reset imgError when photo changes
  useEffect(() => { setImgError(false) }, [settings.linkedinPhoto])

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

  function handleConnect() {
    const popup = window.open(
      `${backendUrl}/api/linkedin/auth`,
      'linkedin-oauth', 'width=600,height=700,scrollbars=yes'
    )
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'LINKEDIN_AUTH') {
        const d = e.data;
        saveSettings({ 
          ...settings, 
          linkedinToken: d.token, 
          linkedinUrn: d.urn, 
          linkedinName: d.name,
          linkedinPhoto: d.photo,
          linkedinEmail: d.email,
          linkedinHeadline: d.headline
        })
        window.removeEventListener('message', handler)
        popup?.close()
      }
    }
    window.addEventListener('message', handler)
  }

  async function disconnect() {
    await saveSettings({ 
      ...settings, 
      linkedinToken: '', 
      linkedinUrn: '', 
      linkedinName: '', 
      linkedinPhoto: '', 
      linkedinEmail: '' 
    })
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

  // 1. Not Connected State (Matches Substack style)
  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4 grayscale hover:grayscale-0 transition-all duration-500 cursor-default">💼</div>
          <h1 className="text-[32px] font-black tracking-tight text-brand-primary mb-2">LinkedIn Studio</h1>
          <p className="text-brand-secondary text-base leading-relaxed">
            Conecta tu cuenta profesional para publicar directamente desde Avocado Studio y automatizar tu presencia en LinkedIn.
          </p>
        </div>

        <div className="card overflow-hidden mb-8 shadow-2xl relative border-brand-accent/20">
            <div className="absolute inset-0 bg-brand-accent/5 pointer-events-none"></div>
          <div className="bg-brand-surface/80 backdrop-blur-md border-b border-brand-border px-6 py-4 relative">
            <span className="text-xs font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
                <i className="pi pi-bolt text-brand-accent"></i> Pasos para empezar
            </span>
          </div>
          <div className="p-6 space-y-5 relative">
            {[
              { n: '1', t: 'Autoriza la App', d: 'Conecta tu cuenta de LinkedIn de forma segura usando OAuth 2.0.' },
              { n: '2', t: 'Genera contenido', d: 'Usa el Redactor IA para crear posts virales optimizados para LinkedIn.' },
              { n: '3', t: 'Publica en un clic', d: 'Envía tus posts directamente a tu feed sin salir de Avocado.' },
            ].map(step => (
              <div key={step.n} className="flex gap-4 group">
                <div className="w-8 h-8 rounded-full bg-brand-accent text-[#1A1A1A] text-sm font-black flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">{step.n}</div>
                <div>
                  <div className="text-[15px] font-bold text-brand-primary group-hover:text-brand-accent transition-colors">{step.t}</div>
                  <div className="text-sm text-brand-secondary mt-1 leading-normal opacity-80">{step.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleConnect} className="btn btn-primary w-full py-4 text-base font-bold shadow-xl hover:shadow-brand-accent/20 flex items-center justify-center gap-2">
          <i className="pi pi-linkedin"></i> Conectar mi LinkedIn
        </button>
      </div>
    )
  }

  // 2. Connected State
  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-linkedin text-[#0A66C2]"></i> LinkedIn Studio
          </h1>
          <p className="text-sm text-brand-secondary mt-1 tracking-wide uppercase font-black opacity-60">Gestión de presencia profesional</p>
        </div>
      </div>

      {/* Profile Card (Matches Substack style) */}
      <div className="relative bg-brand-surface/60 backdrop-blur-2xl border border-brand-border shadow-[var(--shadow)] rounded-3xl p-6 md:p-8 mb-8 overflow-hidden group">
        <div className="absolute top-0 right-0 -mt-24 -mr-24 w-72 h-72 bg-gradient-to-br from-[#0A66C2]/20 to-[#0A66C2]/5 rounded-full blur-3xl pointer-events-none transition-transform duration-700 ease-out group-hover:scale-110" />

        <div className="relative flex items-start gap-6 md:gap-8 flex-wrap md:flex-nowrap">
          {/* Avatar Area */}
          <div className="flex-shrink-0 w-28 h-28 md:w-32 md:h-32 relative">
            {(settings.linkedinPhoto && !imgError) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`} 
                alt={settings.linkedinName}
                className="w-full h-full rounded-full object-cover border-4 border-white shadow-md ring-1 ring-black/5" 
                onError={() => {
                  console.warn('LinkedIn Proxy Avatar load failed, using fallback.');
                  setImgError(true);
                }}
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0A66C2] to-[#004182] flex items-center justify-center text-white font-bold text-4xl shadow-md ring-1 ring-black/5">
                {(settings.linkedinName || 'L')[0].toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 border-4 border-[#1A1A1A] rounded-full flex items-center justify-center">
                <i className="pi pi-check text-[10px] text-white"></i>
            </div>
          </div>
          
          {/* Core Info */}
          <div className="flex-1 min-w-0 pt-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-3xl font-extrabold text-brand-primary tracking-tight leading-tight">{settings.linkedinName || 'Usuario LinkedIn'}</h2>
                <p className="text-[#4ECCA3] font-bold mt-1 text-sm tracking-wide uppercase italic">
                  {settings.linkedinHeadline || (settings.linkedinEmail ? 'Perfil Profesional Verificado' : 'Conectado con LinkedIn')}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
                  <span className="text-brand-primary px-3 py-1 bg-white/5 rounded-full border border-white/10 font-bold flex items-center gap-1.5">
                    <i className="pi pi-shield text-[10px]"></i> Sesión Activa
                  </span>
                  {settings.linkedinEmail && (
                    <span className="text-brand-secondary px-3 py-1 bg-white/5 rounded-full border border-white/10">
                      {settings.linkedinEmail}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2.5 items-start md:items-end w-full md:w-auto">
                <span className="text-[13px] bg-green-500 text-[#1A1A1A] px-4 py-1.5 rounded-full font-bold shadow-md flex items-center gap-2">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> Conectado
                </span>
                <button onClick={disconnect} className="btn btn-danger btn-sm px-6 opacity-60 hover:opacity-100 transition-opacity">
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mb-8 overflow-x-auto no-scrollbar pb-2">
        <div className="inline-flex bg-brand-surface/80 backdrop-blur-md p-1 rounded-xl shadow-inner border border-brand-border whitespace-nowrap">
          {([
            ['post',     'Crear Post'],
            ['stats',    'Historial'],
          ] as [LinkedInTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`tab ${tab === t ? 'tab-active' : 'tab-inactive'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Post Creator (LinkedIn Style) */}
      {tab === 'post' && (
        <div className="bg-brand-surface/80 backdrop-blur-xl border border-brand-border rounded-3xl p-0 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden relative">
          
          {/* Editor Header: Profile & Visibility */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.03]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white overflow-hidden shadow-sm border border-white/10">
              {settings.linkedinPhoto && !imgError ? (
                /* eslint-disable-next-line @next/next/no-img-element */
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
              <div className="text-[15px] font-bold text-brand-primary leading-tight">{settings.linkedinName || 'Tu nombre'}</div>
              <button className="flex items-center gap-1.5 mt-0.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors">
                <i className="pi pi-globe text-[10px] text-brand-secondary opacity-70"></i>
                <span className="text-[11px] font-bold text-brand-secondary opacity-80 uppercase tracking-tighter">Cualquiera</span>
                <i className="pi pi-chevron-down text-[8px] text-brand-secondary opacity-40"></i>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="px-6 py-4 min-h-[220px]">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              className="w-full bg-transparent border-none focus:ring-0 text-brand-primary text-[17px] leading-relaxed resize-none placeholder-brand-secondary/40 font-normal outline-none scrollbar-thin scrollbar-thumb-white/10"
              placeholder="¿De qué quieres hablar hoy?"
            />
            
            {/* Image Preview */}
            {image && (
              <div className="relative mt-4 rounded-xl overflow-hidden group shadow-2xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={image.startsWith('http') ? (image.includes('proxy-image') ? image : `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/linkedin/proxy-image?url=${encodeURIComponent(image)}`) : image} 
                  alt="Preview" 
                  className="w-full max-h-[400px] object-cover" 
                />
                <button 
                  onClick={() => setImage(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-brand-danger transition-colors border border-white/20"
                >
                  <i className="pi pi-times text-xs"></i>
                </button>
              </div>
            )}
          </div>

          {/* Schedule Panel Overlay */}
          {showSchedule && (
            <div className="absolute inset-x-0 bottom-[72px] bg-brand-surface/95 backdrop-blur-xl border-t border-brand-border p-5 animate-in slide-in-from-bottom-2 z-10 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-brand-primary flex items-center gap-2">
                  <i className="pi pi-calendar-plus text-orange-400"></i> Programar Publicación
                </span>
                <button onClick={() => setShowSchedule(false)} className="text-brand-secondary hover:text-white"><i className="pi pi-times"></i></button>
               <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="date" 
                  value={scheduledDate ? scheduledDate.split('T')[0] : ''}
                  onChange={e => {
                    const timePart = scheduledDate ? scheduledDate.split('T')[1] || '12:00' : '12:00'
                    setScheduledDate(e.target.value ? `${e.target.value}T${timePart}` : '')
                  }}
                  className="input !h-11 flex-1"
                />
                <select 
                  value={scheduledDate ? (scheduledDate.split('T')[1] || '12:00') : '12:00'}
                  onChange={e => {
                    const datePart = scheduledDate ? scheduledDate.split('T')[0] : new Date().toISOString().split('T')[0]
                    setScheduledDate(`${datePart}T${e.target.value}`)
                  }}
                  className="input !h-11 w-full sm:w-32 bg-brand-surface text-brand-primary"
                >
                  {Array.from({ length: 96 }).map((_, i) => {
                    const h = Math.floor(i / 4).toString().padStart(2, '0')
                    const m = (i % 4 * 15).toString().padStart(2, '0')
                    const timeStr = `${h}:${m}`
                    return <option key={timeStr} value={timeStr}>{timeStr}</option>
                  })}
                </select>
                <button onClick={() => setShowSchedule(false)} className="btn btn-primary px-6 h-11">Confirmar</button>
              </div>
             </div>
              <p className="text-[11px] text-brand-secondary mt-3 opacity-60 italic">Automáticamente se publicará en LinkedIn en la fecha elegida.</p>
            </div>
          )}

          {/* Media Toolbar & Footer */}
          <div className="px-5 py-4 bg-brand-bg/30 border-t border-white/[0.03] flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              {/* Hidden File Input */}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              
              <button onClick={handleImageClick} className="w-10 h-10 rounded-full flex items-center justify-center transition-all text-blue-400 bg-white/0 hover:bg-white/5 active:scale-90" title="Cargar Imagen">
                <i className="pi pi-image text-lg"></i>
              </button>
              <button onClick={() => setShowSchedule(!showSchedule)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${showSchedule ? 'text-orange-400 bg-white/10' : 'text-orange-400 bg-white/0 hover:bg-white/5'} active:scale-90`} title="Programar">
                <i className="pi pi-calendar text-lg"></i>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className={`text-[11px] font-mono font-bold tracking-widest ${text.length > 3000 ? 'text-red-400' : 'text-brand-secondary opacity-40'}`}>
                  {text.length.toLocaleString()} / 3,000
                </span>
                {scheduledDate && (
                  <span className="text-[10px] text-orange-400 font-bold uppercase tracking-tighter animate-pulse">
                     ⏰ {new Date(scheduledDate).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <button
                className="btn py-2.5 px-8 rounded-full bg-[#0A66C2] hover:bg-[#004182] disabled:opacity-40 disabled:hover:bg-[#0A66C2] transition-all font-bold text-sm shadow-lg shadow-[#0A66C2]/10"
                onClick={handlePublish}
                disabled={loading || !text.trim()}
              >
                {loading ? <><i className="pi pi-spin pi-spinner mr-2"></i>Enviando...</> : (scheduledDate ? 'Programar' : 'Publicar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No articles tab anymore */}

      {tab === 'stats' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-brand-primary flex items-center gap-2">
              <i className="pi pi-history text-brand-accent"></i> Historial de Publicaciones
            </h3>
            <button 
              onClick={fetchStats} 
              disabled={statsLoading}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <i className={`pi pi-sync ${statsLoading ? 'pi-spin' : ''}`}></i>
              {statsLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          <div className="space-y-6">
            {posts.length > 0 ? posts.map((p) => (
              <div key={p.post_id} className="bg-brand-surface/60 backdrop-blur-xl border border-brand-border rounded-3xl overflow-hidden shadow-[var(--shadow)] animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Post Header */}
                <div className="flex items-center gap-3 px-6 py-5">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center text-white overflow-hidden shadow-sm border-2 border-brand-border/20">
                    {settings.linkedinPhoto && !imgError ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img 
                        src={`${backendUrl}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`}
                        alt="Me" 
                        className="w-full h-full object-cover" 
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <span className="font-bold text-xl">{(settings.linkedinName || 'U')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-[17px] font-bold text-brand-primary leading-tight">{settings.linkedinName || 'Tu nombre'}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-brand-secondary font-medium tracking-wide">
                        {new Date(p.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="w-1 h-1 bg-brand-secondary/30 rounded-full"></span>
                      <span className="text-[10px] text-brand-accent font-black uppercase tracking-tighter flex items-center gap-1">
                        <i className="pi pi-check-circle text-[8px]"></i> Enviado desde Avocado
                      </span>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <div className="px-6 pb-6 whitespace-pre-wrap text-brand-primary text-[15px] leading-relaxed opacity-90 font-normal">
                  {p.text || <span className="italic opacity-30">Contenido multimedia sin texto acompañante</span>}
                </div>

                {/* Simple Footer/ID Info */}
                <div className="px-6 py-3 bg-brand-bg/20 border-t border-white/[0.02] flex justify-between items-center">
                  <div className="text-[9px] font-mono text-brand-secondary opacity-30 uppercase tracking-widest">
                    ID: {p.post_id.split(':').pop()}
                  </div>
                  <div className="flex items-center gap-4 opacity-50 text-brand-secondary">
                    <span className="flex items-center gap-1.5 text-[11px]"><i className="pi pi-thumbs-up"></i> 0</span>
                    <span className="flex items-center gap-1.5 text-[11px]"><i className="pi pi-comment"></i> 0</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="bg-brand-bg border border-dashed border-brand-border rounded-2xl p-20 flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
                {statsLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <i className="pi pi-spin pi-spinner text-3xl text-brand-accent"></i>
                    <p className="text-sm text-brand-secondary">Consultando historial local...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 opacity-40">
                    <i className="pi pi-inbox text-4xl"></i>
                    <p className="text-sm">Aún no hay publicaciones para mostrar en tu feed.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {posts.length > 0 && (
            <div className="mt-10 pt-6 border-t border-brand-border flex flex-col items-center justify-center text-center opacity-40">
               <i className="pi pi-shield text-xl mb-2"></i>
               <p className="text-[11px] font-bold uppercase tracking-widest">
                 Seguimiento interno activado • {posts.length} contenidos registrados
               </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

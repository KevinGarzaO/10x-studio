import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { Password } from 'primereact/password'
import { api } from '@/lib/api'

const TEXT_MODEL = { label: 'Claude (Anthropic)', value: 'claude', icon: 'pi-bolt' }
const IMG_MODEL = { label: 'Gemini Flash (Google)', value: 'nanobanana', icon: 'pi-sparkles' }

const TEXT_PROVIDER = { label: 'API Key de Anthropic (Claude)', url: 'https://console.anthropic.com/', ph: 'sk-ant-...' }
const IMG_PROVIDER = { label: 'API Key de Google (Gemini)', url: 'https://aistudio.google.com/app/apikey', ph: 'AIzaSy...' }

function daysUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export function SettingsSection() {
  const { settings, saveSettings, substackConnected, reloadSubstackProfile } = useApp()
  
  const [localSettings, setLocalSettings] = useState({
    claudeKey: settings.apiKeys?.claude || settings.apiKey || '',
    geminiKey: settings.apiKeys?.nanobanana || ''
  })

  const [substackProfile, setSubstackProfile] = useState<any>(null)

  const loadSubstackProfile = useCallback(async () => {
    try {
      const sub = await api<any>('/api/substack/profile')
      if (sub && !sub.error) {
        setSubstackProfile(sub)
      }
    } catch {}
  }, [])

  useEffect(() => { loadSubstackProfile() }, [substackConnected, loadSubstackProfile])

  useEffect(() => {
    setLocalSettings({
      claudeKey: settings.apiKeys?.claude || settings.apiKey || '',
      geminiKey: settings.apiKeys?.nanobanana || ''
    })
  }, [settings.apiKeys, settings.apiKey, settings.modelVersions])

  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleSave = async (updated: typeof localSettings) => {
    await saveSettings({ 
      ...settings, 
      textModel: 'claude',
      imgModel: 'nanobanana',
      apiKeys: { claude: updated.claudeKey, nanobanana: updated.geminiKey },
      apiKey: updated.claudeKey || settings.apiKey
    })
  }

  const blurKey = () => handleSave(localSettings)

  return (
    <div className="px-8 py-7" style={{ maxWidth: 1100 }}>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#64748b', color: '#fff' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
            Configuración
          </h1>
        </div>
        <p style={{ fontSize: 13.5, color: '#64748b' }}>Gestiona tus claves de API y preferencias de Inteligencia Artificial</p>
      </div>

      <div className="grid gap-8">
        {/* Claude - Texto */}
        <section className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center gap-3">
            <i className="pi pi-bolt text-brand-secondary"></i>
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-wide">Claude (Anthropic) - Texto</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-brand-secondary uppercase tracking-widest">Versión del Modelo</label>
                <p className="text-sm font-medium text-brand-primary">Claude Opus 4.6</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-brand-border pt-6">
                <label className="text-xs font-black text-brand-secondary uppercase tracking-widest">{TEXT_PROVIDER.label}</label>
                <Password
                  value={localSettings.claudeKey}
                  onChange={(e: any) => setLocalSettings({ ...localSettings, claudeKey: e.target.value })}
                  onBlur={blurKey}
                  placeholder={TEXT_PROVIDER.ph}
                  feedback={false}
                  toggleMask
                  inputClassName="input w-full md:w-[600px] font-mono text-sm !bg-brand-bg"
                />
                <a href={TEXT_PROVIDER.url} target="_blank" rel="noreferrer" className="text-xs text-brand-accent font-bold hover:brightness-110 flex items-center gap-1.5 mt-2 w-fit underline transition-all">
                  Obtener API Key <i className="pi pi-external-link text-[10px]"></i>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Gemini - Imagenes */}
        <section className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center gap-3">
            <i className="pi pi-sparkles text-brand-secondary"></i>
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-wide">Gemini Flash (Google) - Imágenes</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-brand-secondary uppercase tracking-widest">Versión del Modelo</label>
                <p className="text-sm font-medium text-brand-primary">Gemini 3.1 Flash Image</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-brand-border pt-6">
                <label className="text-xs font-black text-brand-secondary uppercase tracking-widest">{IMG_PROVIDER.label}</label>
                <Password
                  value={localSettings.geminiKey}
                  onChange={(e: any) => setLocalSettings({ ...localSettings, geminiKey: e.target.value })}
                  onBlur={blurKey}
                  placeholder={IMG_PROVIDER.ph}
                  feedback={false}
                  toggleMask
                  inputClassName="input w-full md:w-[600px] font-mono text-sm !bg-brand-bg"
                />
                <a href={IMG_PROVIDER.url} target="_blank" rel="noreferrer" className="text-xs text-brand-accent font-bold hover:brightness-110 flex items-center gap-1.5 mt-2 w-fit underline transition-all">
                  Obtener API Key <i className="pi pi-external-link text-[10px]"></i>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* LinkedIn */}
        <section id="linkedin" className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center gap-3">
            <i className="pi pi-linkedin text-[#0A66C2]"></i>
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-wide">LinkedIn</h2>
          </div>
          <div className="p-6">
            {settings.linkedinToken ? (
              <div className="flex items-center gap-4 p-5 rounded-xl" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="relative flex-shrink-0 w-14 h-14">
                  {settings.linkedinPhoto ? (
                    <img 
                      src={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/linkedin/proxy-image?url=${encodeURIComponent(settings.linkedinPhoto)}`} 
                      alt={settings.linkedinName || 'LinkedIn'}
                      className="w-full h-full rounded-full object-cover border-2 border-white shadow-md" 
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
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
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0d1117' }}>{settings.linkedinName || 'LinkedIn User'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', letterSpacing: '0.02em' }}>PERFIL PROFESIONAL VERIFICADO</div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#64748b' }}>
                      <div className="rounded-full" style={{ width: 6, height: 6, background: '#10b981' }}/>
                      Sesión Activa
                    </div>
                    {settings.linkedinEmail && <span style={{ fontSize: 12, color: '#94a3b8' }}>{settings.linkedinEmail}</span>}
                  </div>
                  {settings.linkedinExpiresAt && (
                    <div className="flex items-center gap-2 mt-2">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Expira el {new Date(settings.linkedinExpiresAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 11, color: Math.max(0, Math.round((new Date(settings.linkedinExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) <= 7 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                        ({Math.max(0, Math.round((new Date(settings.linkedinExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} días)
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded-lg transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.05)', cursor: 'pointer' }}
                  onClick={() => {
                    const popup = window.open(
                      `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/linkedin/auth`,
                      'linkedin-oauth',
                      'width=600,height=700,scrollbars=yes'
                    )
                    const handler = (e: MessageEvent) => {
                      if (e.data?.type === 'LINKEDIN_AUTH') {
                        saveSettings({ 
                          ...settings, 
                          linkedinToken: e.data.token, 
                          linkedinUrn: e.data.urn, 
                          linkedinName: e.data.name,
                          linkedinPhoto: e.data.photo,
                          linkedinEmail: e.data.email,
                          linkedinHeadline: e.data.headline,
                          linkedinConnectedAt: e.data.connectedAt,
                          linkedinExpiresAt: e.data.expiresAt
                        })
                        window.removeEventListener('message', handler)
                        popup?.close()
                      }
                    }
                    window.addEventListener('message', handler)
                  }}
                >
                  Reconectar
                </button>
                {settings.linkedinExpiresAt && daysUntil(settings.linkedinExpiresAt) <= 7 && (
                <button
                  className="px-4 py-2 rounded-lg transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer' }}
                  onClick={async () => { await saveSettings({ ...settings, linkedinToken: '', linkedinUrn: '', linkedinName: '', linkedinPhoto: '', linkedinEmail: '' }) }}
                >
                  Desconectar
                </button>
                )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-brand-primary">No conectado</p>
                  <p className="text-xs text-brand-secondary mt-0.5">Conecta tu cuenta para publicar directamente desde Avocado</p>
                </div>
                <button
                  className="btn btn-sm bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90 transition-colors"
                  onClick={() => {
                    const popup = window.open(
                      `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/linkedin/auth`,
                      'linkedin-oauth',
                      'width=600,height=700,scrollbars=yes'
                    )
                    const handler = (e: MessageEvent) => {
                      if (e.data?.type === 'LINKEDIN_AUTH') {
                        saveSettings({ 
                          ...settings, 
                          linkedinToken: e.data.token, 
                          linkedinUrn: e.data.urn, 
                          linkedinName: e.data.name,
                          linkedinPhoto: e.data.photo,
                          linkedinEmail: e.data.email,
                          linkedinHeadline: e.data.headline,
                          linkedinConnectedAt: e.data.connectedAt,
                          linkedinExpiresAt: e.data.expiresAt
                        })
                        window.removeEventListener('message', handler)
                        popup?.close()
                      }
                    }
                    window.addEventListener('message', handler)
                  }}
                >
                  <i className="pi pi-linkedin mr-1 text-[10px]"></i>Conectar LinkedIn
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Substack */}
        <section id="substack" className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
          <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center gap-3">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#ff6719' }}>
              <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg>
            </div>
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-wide">Substack</h2>
          </div>
          <div className="p-6">
            {substackConnected && substackProfile ? (
              <div className="flex items-center gap-4 p-5 rounded-xl" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="relative flex-shrink-0 w-14 h-14">
                  {substackProfile.photo_url ? (
                    <img 
                      src={substackProfile.photo_url} 
                      alt={substackProfile.name || 'Substack'}
                      className="w-full h-full rounded-full object-cover border-2 border-white shadow-md" 
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md" style={{ background: '#ff6719' }}>
                      {(substackProfile.name || 'S')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
                    style={{ width: 18, height: 18, background: '#10b981', border: '2px solid #fff' }}>
                    <svg width="8" height="8" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
                <div className="flex-1">
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0d1117' }}>{substackProfile.name || 'Substack User'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6719', letterSpacing: '0.02em' }}>PERFIL VERIFICADO</div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#64748b' }}>
                      <div className="rounded-full" style={{ width: 6, height: 6, background: '#10b981' }}/>
                      Sesión Activa
                    </div>
                    {substackProfile.email && <span style={{ fontSize: 12, color: '#94a3b8' }}>{substackProfile.email}</span>}
                  </div>
                  {substackProfile.expires_at && (
                    <div className="flex items-center gap-2 mt-2">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Expira el {new Date(substackProfile.expires_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 11, color: Math.max(0, Math.round((new Date(substackProfile.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) <= 7 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                        ({Math.max(0, Math.round((new Date(substackProfile.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} días)
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded-lg transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#ff6719', border: '1px solid rgba(255,103,25,0.3)', background: 'rgba(255,103,25,0.05)', cursor: 'pointer' }}
                  onClick={async () => { await loadSubstackProfile() }}
                >
                  Reconectar
                </button>
                {substackProfile.expires_at && daysUntil(substackProfile.expires_at) <= 7 && (
                <button
                  className="px-4 py-2 rounded-lg transition-all"
                  style={{ fontSize: 12.5, fontWeight: 600, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer' }}
                  onClick={async () => { await api('/api/substack/cookies', { method: 'DELETE' }); await reloadSubstackProfile(); setSubstackProfile(null) }}
                >
                  Desconectar
                </button>
                )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-brand-primary">No conectado</p>
                  <p className="text-xs text-brand-secondary mt-0.5">Conecta tu Substack desde la extensión de Chrome</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

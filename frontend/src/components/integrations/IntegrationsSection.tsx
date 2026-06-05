'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { WebhookConfig, Platform } from '@/types'
import { ALL_PLATFORMS, PLATFORMS } from '@/types'
import { uid } from '@/lib/utils'

interface IntegrationConfig {
  wpUrl?: string; wpUsername?: string; wpAppPassword?: string; wpDefaultStatus?: string
  linkedinToken?: string
  webhooks?: WebhookConfig[]
  _hasWp?: boolean; _hasLinkedin?: boolean
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`w-2 h-2 rounded-full inline-block ${active ? 'bg-brand-accent shadow-[0_0_8px_var(--color-accent)]' : 'bg-brand-border'}`} />
}

export function IntegrationsSection() {
  const [cfg,     setCfg]     = useState<IntegrationConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  // WP fields
  const [wpUrl,      setWpUrl]      = useState('')
  const [wpUser,     setWpUser]     = useState('')
  const [wpPass,     setWpPass]     = useState('')
  const [wpStatus,   setWpStatus]   = useState<'draft' | 'publish'>('draft')
  // LinkedIn
  const [liToken,    setLiToken]    = useState('')
  // Webhooks
  const [webhooks,   setWebhooks]   = useState<WebhookConfig[]>([])
  const [whModal,    setWhModal]    = useState(false)
  const [editingWh,  setEditingWh]  = useState<WebhookConfig | null>(null)

  useEffect(() => { loadCfg() }, [])

  async function loadCfg() {
    const data = await api<any>('/api/integrations')
    setCfg(data)
    setWpUrl(data.wpUrl || ''); setWpUser(data.wpUsername || '')
    setWpPass(data.wpAppPassword || ''); setWpStatus(data.wpDefaultStatus || 'draft')
    setLiToken(data.linkedinToken || '')
    setWebhooks(data.webhooks || [])
    setLoading(false)
  }

  function showMsg(type: 'ok' | 'err', text: string) {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 4000)
  }

  async function saveWp() {
    setSaving('wp')
    await api('/api/integrations', { method: 'POST', 
      body: JSON.stringify({ wpUrl: wpUrl.trim(), wpUsername: wpUser.trim(), wpAppPassword: wpPass, wpDefaultStatus: wpStatus }) })
    setSaving(null)
    showMsg('ok', '✅ WordPress guardado'); loadCfg()
  }

  async function saveLi() {
    setSaving('li')
    await api('/api/integrations', { method: 'POST',
      body: JSON.stringify({ linkedinToken: liToken.trim() }) })
    setSaving(null)
    showMsg('ok', '✅ LinkedIn guardado'); loadCfg()
  }

  async function saveWebhooks(whs: WebhookConfig[]) {
    await api('/api/integrations', { method: 'POST',
      body: JSON.stringify({ webhooks: whs }) })
    setWebhooks(whs); loadCfg()
  }

  // Test connections
  async function testWp() {
    setSaving('test-wp')
    try {
      const baseUrl = wpUrl.replace(/\/$/, '')
      const auth    = btoa(`${wpUser}:${wpPass}`)
      const res     = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, { headers: { 'Authorization': `Basic ${auth}` } })
      if (res.ok) { const u = await res.json(); showMsg('ok', `✅ Conectado como: ${u.name}`) }
      else showMsg('err', `❌ Error ${res.status} — verifica URL, usuario y contraseña de aplicación`)
    } catch (e) { showMsg('err', `❌ ${String(e)}`) }
    setSaving(null)
  }

  async function testLi() {
    setSaving('test-li')
    try {
      const res = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { 'Authorization': `Bearer ${liToken}` } })
      if (res.ok) { const u = await res.json(); showMsg('ok', `✅ Conectado como: ${u.name}`) }
      else showMsg('err', `❌ Token inválido o expirado (${res.status})`)
    } catch (e) { showMsg('err', `❌ ${String(e)}`) }
    setSaving(null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><i className="pi pi-spin pi-spinner text-4xl text-stone-800" /></div>

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-link text-brand-secondary"></i> Integraciones
          </h1>
          <p className="text-sm text-brand-secondary mt-1">Publica directo en WordPress, LinkedIn y vía webhooks</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-bold shadow-sm ${msg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* WordPress */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl mb-5 overflow-hidden shadow-[var(--shadow)]">
        <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl drop-shadow-md">🌐</span>
            <div>
              <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">WordPress</span>
              <p className="text-xs text-brand-secondary mt-0.5">REST API / Application Password</p>
            </div>
          </div>
          <StatusDot active={!!cfg._hasWp} />
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label block mb-1.5">URL de tu sitio WordPress</label>
            <div className="relative">
              <i className="pi pi-globe absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
              <input type="url" value={wpUrl} onChange={e => setWpUrl(e.target.value)} className="input !pl-9" placeholder="https://miblog.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label block mb-1.5">Usuario</label>
              <div className="relative">
                <i className="pi pi-user absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
                <input type="text" value={wpUser} onChange={e => setWpUser(e.target.value)} className="input !pl-9" placeholder="admin" />
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">
                Application Password
                <a href="https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/" target="_blank" rel="noopener" className="ml-1 text-brand-accent font-normal normal-case tracking-normal hover:brightness-110 text-xs underline">¿cómo obtenerlo?</a>
              </label>
              <input type="password" value={wpPass} onChange={e => setWpPass(e.target.value)} className="input font-mono text-xs bg-brand-bg/50" placeholder="xxxx xxxx xxxx xxxx" />
            </div>
          </div>
          <div>
            <label className="label block mb-2">Estado por defecto al publicar</label>
            <select value={wpStatus} onChange={e => setWpStatus(e.target.value as 'draft' | 'publish')} className="input w-56">
              <option value="draft">Borrador</option>
              <option value="publish">Publicar directo</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={testWp} disabled={!wpUrl || !wpUser || !wpPass || saving === 'test-wp'} className="btn btn-secondary btn-sm">
              {saving === 'test-wp' ? 'Probando...' : 'Probar conexión'}
            </button>
            <button onClick={saveWp} disabled={saving === 'wp'} className="btn btn-primary btn-sm px-4">
              {saving === 'wp' ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          <p className="text-xs text-brand-secondary bg-brand-bg/50 p-3 rounded-xl border border-brand-border italic">
            <i className="pi pi-info-circle mr-1 text-brand-accent"></i>
            El Application Password se genera en <strong className="text-brand-primary">WordPress → Usuarios → Tu perfil → Application Passwords</strong>. No es tu contraseña real.
          </p>
        </div>
      </div>

      {/* LinkedIn */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl mb-5 overflow-hidden shadow-[var(--shadow)]">
        <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl drop-shadow-md">💼</span>
            <div>
              <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">LinkedIn</span>
              <p className="text-xs text-brand-secondary mt-0.5">OAuth 2.0 Access Token</p>
            </div>
          </div>
          <StatusDot active={!!cfg._hasLinkedin} />
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label block mb-1.5">
              Access Token
              <span className="ml-1 text-brand-secondary font-normal normal-case tracking-normal text-xs">— requiere <code className="bg-brand-bg border border-brand-border px-1.5 rounded text-[10px]">w_member_social</code></span>
            </label>
            <input type="password" value={liToken} onChange={e => setLiToken(e.target.value)} className="input font-mono text-xs bg-brand-bg/50" placeholder="AQV..." />
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-500/90 leading-relaxed">
            <strong className="text-amber-500"><i className="pi pi-info-circle mr-1"></i>Cómo obtener el token:</strong> Crea una app en{' '}
            <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener" className="underline font-bold hover:text-amber-400 transition-colors">linkedin.com/developers/apps</a>,
            agrega el producto <strong>Share on LinkedIn</strong> (que incluye <code>w_member_social</code>),
            genera un access token con OAuth 2.0 y pégalo aquí. Los tokens duran ~60 días.
          </div>
          <div className="flex gap-2">
            <button onClick={testLi} disabled={!liToken || saving === 'test-li'} className="btn btn-secondary btn-sm">
              {saving === 'test-li' ? 'Verificando...' : 'Verificar token'}
            </button>
            <button onClick={saveLi} disabled={!liToken || saving === 'li'} className="btn btn-primary btn-sm px-4">
              {saving === 'li' ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[var(--shadow)]">
        <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl drop-shadow-md">🔗</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-brand-primary uppercase tracking-wide">Webhooks</span>
                {webhooks.length > 0 && <span className="text-[10px] font-bold bg-brand-accent text-[#1A1A1A] px-2 py-0.5 rounded-full">{webhooks.length}</span>}
              </div>
              <p className="text-xs text-brand-secondary mt-0.5">Zapier, Make, n8n, etc.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-sm shadow-sm" onClick={() => { setEditingWh(null); setWhModal(true) }}>
            <i className="pi pi-plus mr-1 text-[10px]"></i>
            Agregar
          </button>
        </div>
        <div className="p-6">
          {webhooks.length === 0 ? (
            <div className="text-center py-10 text-brand-secondary">
              <p className="text-sm font-bold mb-2">Sin webhooks configurados.</p>
              <p className="text-xs italic opacity-80">Úsalos para enviar contenido a cualquier API, Zapier, Make, n8n, etc.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map(wh => (
                <div key={wh.id} className="flex items-center gap-3 bg-brand-bg/50 border border-brand-border rounded-xl px-4 py-3 hover:bg-brand-bg transition-colors group">
                  <StatusDot active={wh.active} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-brand-primary">{wh.name}</div>
                    <div className="text-xs text-brand-secondary/80 truncate font-mono mt-0.5">{wh.url}</div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {wh.platforms.map(p => <span key={p} className="text-[10px] font-bold bg-brand-surface border border-brand-border text-brand-secondary px-2 py-0.5 rounded-lg shadow-sm">{PLATFORMS[p].icon} {PLATFORMS[p].label}</span>)}
                    </div>
                  </div>
                  <button onClick={() => { setEditingWh(wh); setWhModal(true) }} className="btn btn-secondary btn-sm h-8 w-8 !p-0 justify-center">
                    <i className="pi pi-cog text-xs"></i>
                  </button>
                  <button onClick={() => saveWebhooks(webhooks.filter(w => w.id !== wh.id))} className="btn btn-danger btn-sm h-8 w-8 !p-0 justify-center">
                    <i className="pi pi-trash text-xs"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {whModal && (
        <WebhookModal
          webhook={editingWh}
          onClose={() => { setWhModal(false); setEditingWh(null) }}
          onSave={wh => {
            const updated = editingWh
              ? webhooks.map(w => w.id === wh.id ? wh : w)
              : [...webhooks, { ...wh, id: uid() }]
            saveWebhooks(updated); setWhModal(false); setEditingWh(null)
          }}
        />
      )}
    </div>
  )
}

function WebhookModal({ webhook, onClose, onSave }: {
  webhook: WebhookConfig | null
  onClose: () => void
  onSave: (wh: WebhookConfig) => void
}) {
  const [name,      setName]      = useState(webhook?.name || '')
  const [url,       setUrl]       = useState(webhook?.url || '')
  const [secret,    setSecret]    = useState(webhook?.secret || '')
  const [active,    setActive]    = useState(webhook?.active ?? true)
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(webhook?.platforms || []))

  function togglePlatform(p: Platform) {
    setPlatforms(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-[var(--shadow)]">
        <h2 className="text-xl font-bold mb-5 text-brand-primary">{webhook ? 'Editar webhook' : 'Nuevo webhook'}</h2>
        <div className="space-y-4">
          <div>
            <label className="label block mb-1.5">Nombre</label>
            <div className="relative">
              <i className="pi pi-tag absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="input !pl-9" placeholder="Ej: Zapier, n8n, Mi API" autoFocus />
            </div>
          </div>
          <div>
            <label className="label block mb-1.5">URL del endpoint</label>
            <div className="relative">
              <i className="pi pi-link absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} className="input !pl-9" placeholder="https://hooks.zapier.com/..." />
            </div>
          </div>
          <div>
            <label className="label block mb-1.5">Secret (opcional)</label>
            <input type="password" value={secret} onChange={e => setSecret(e.target.value)} className="input font-mono text-xs" placeholder="Se envía como X-Webhook-Secret" />
          </div>
          <div>
            <label className="label block mb-2">Plataformas que lo disparan</label>
            <div className="flex flex-wrap gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border h-[42px] items-center px-2">
              {ALL_PLATFORMS.map(p => (
                <button key={p} onClick={() => togglePlatform(p)}
                  className={`tab ${platforms.has(p) ? 'tab-active' : 'tab-inactive'} !text-[10px] !h-[28px] px-2`}>
                  {PLATFORMS[p].icon} {PLATFORMS[p].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-brand-bg/50 p-3 rounded-xl border border-brand-border">
            <button onClick={() => setActive(!active)}
              className={`w-10 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 ${active ? 'bg-brand-accent' : 'bg-brand-border'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${active ? 'left-5' : 'left-1'}`} />
            </button>
            <div>
              <span className="text-sm font-bold text-brand-primary">{active ? 'Activo' : 'Inactivo'}</span>
              <p className="text-xs text-brand-secondary mt-0.5">{active ? 'El webhook disparará con nuevas publicaciones' : 'El webhook está desactivado'}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-8">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm px-4 shadow-lg" onClick={() => {
            if (!name.trim() || !url.trim()) return
            onSave({ id: webhook?.id || uid(), name, url, secret: secret || undefined, platforms: Array.from(platforms), active })
          }}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

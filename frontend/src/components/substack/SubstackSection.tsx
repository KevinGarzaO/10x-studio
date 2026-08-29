'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { SubstackStats } from './SubstackStats'
import { SubstackPublish } from './SubstackPublish'
import { SubstackSubscribers } from './SubstackSubscribers'
import { SubstackNotes } from './SubstackNotes'
import { SubstackArticles } from './SubstackArticles'
import { SubstackPostDetail } from './SubstackPostDetail'
import { api } from '@/lib/api'

type SubTab = 'stats' | 'subscribers' | 'publish' | 'notes' | 'articles' | 'detail'

interface SubstackProfile {
  name: string; handle: string; email: string; avatar: string; bio: string;
  subCount: number; followerCount: number; connectedAt: string; expiresAt: string;
  links: { url: string; type: string; label: string }[];
  pubLogo?: string;
  publication_name?: string;
  primaryPublication?: { subdomain: string; name: string };
}

function daysUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export function SubstackSection() {
  const { substackConnected, substackPublication, reloadSubstackProfile, editorPrefill } = useApp()
  const [tab, setTab] = useState<SubTab>('articles')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)

  useEffect(() => {
    if (editorPrefill) {
      setTab(editorPrefill.type === 'note' ? 'notes' : 'publish')
    }
  }, [editorPrefill])

  const [profile, setProfile] = useState<SubstackProfile | null>(null)
  const [autoSub, setAutoSub] = useState(true)

  const loadProfile = useCallback(async () => {
    try {
      const sub = await api<any>('/api/substack/profile')
      if (sub && !sub.error) {
        let parsedLinks = sub.social_links || []
        if (typeof parsedLinks === 'string') {
          try { parsedLinks = JSON.parse(parsedLinks) } catch { parsedLinks = [] }
        }
        const enrichedLinks = Array.isArray(parsedLinks) ? parsedLinks.map((l: any) => ({
          ...l,
          label: l.label || (l.type === 'twitter' ? '𝕏 Twitter' : l.type === 'linkedin' ? 'LinkedIn' : l.type || 'Enlace')
        })) : []

        setProfile({
          name: sub.name || '',
          handle: sub.handle || '',
          email: sub.email || '',
          avatar: sub.photo_url || sub.avatar || '',
          bio: sub.bio || '',
          subCount: sub.subscriber_count || 0,
          followerCount: sub.follower_count || 0,
          connectedAt: sub.created_at || '',
          expiresAt: sub.expires_at || sub.updated_at || '', 
          links: enrichedLinks,
          pubLogo: sub.publication_logo || '',
          publication_name: sub.publication_name || '',
          primaryPublication: { 
            subdomain: sub.subdomain || '', 
            name: sub.publication_name || '' 
          }
        })
      }
    } catch {}
  }, [])

  useEffect(() => { loadProfile() }, [substackConnected, loadProfile])

  async function disconnect() {
    await api('/api/substack/cookies', { method: 'DELETE' })
    await reloadSubstackProfile()
    setProfile(null)
  }

  async function verifyAndSubscribe() {
    await reloadSubstackProfile()
    const sub = await api<any>('/api/substack/profile')
    if (sub && !sub.error && autoSub && (sub.email || sub.handle)) {
      await api('/api/substack/subscriber/add', {
        method: 'POST',
        body: JSON.stringify({ email: sub.email || `${sub.handle}@substack.com` })
      })
    }
  }

  // 1. Not Connected State
  if (!substackConnected) {
    return (
      <div className="max-w-lg mx-auto py-10 animate-fadein">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📰</div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary mb-2">Conectar Substack</h1>
          <p className="text-brand-secondary text-sm leading-relaxed">
            Conecta tu cuenta usando la extensión de Chrome para publicar, ver estadísticas y gestionar suscriptores.
          </p>
        </div>
        <div className="card overflow-hidden mb-6">
          <div className="bg-brand-surface border-b border-brand-border px-5 py-3">
            <span className="text-xs font-bold text-brand-primary uppercase tracking-wide">Cómo conectar</span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { n: '1', t: 'Instala la extensión', d: 'Descomprime substack-extension.zip → Chrome → chrome://extensions → Modo desarrollador → Cargar descomprimida.' },
              { n: '2', t: 'Inicia sesión en Substack', d: 'Ve a substack.com e inicia sesión con tu cuenta normalmente.' },
              { n: '3', t: 'Conecta desde la extensión', d: 'Clic en el ícono 10X en Chrome y presiona "Conectar Substack".' },
              { n: '4', t: 'Esta página se recarga sola', d: 'La extensión recarga tu app automáticamente y verás tu perfil aquí.' },
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

        <div className="bg-brand-accent/5 border border-brand-accent/10 rounded-xl p-4 mb-6 flex items-start gap-3">
          <input 
            type="checkbox" 
            id="autosub" 
            checked={autoSub} 
            onChange={e => setAutoSub(e.target.checked)}
            className="mt-1 w-4 h-4 accent-brand-accent"
          />
          <label htmlFor="autosub" className="text-sm text-brand-primary font-medium leading-tight cursor-pointer">
            Quiero suscribirme al newsletter de Transformateck
            <span className="block text-[11px] text-brand-secondary mt-0.5 font-normal">Recibe las últimas actualizaciones y noticias directamente en tu correo.</span>
          </label>
        </div>

        <button onClick={verifyAndSubscribe} className="btn btn-primary w-full shadow-lg">
          Verificar conexión
        </button>
      </div>
    )
  }

  // 2. Connected State
  return (
    <div className="px-8 py-7 animate-fadein" style={{ maxWidth: 1000 }}>
      {/* Title & Profile Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: '#ef4444', color: '#fff' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M4 4h16M4 9h16M4 20l8-7 8 7V9H4v11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: '#0d1117', lineHeight: 1 }}>
              Substack
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: '#64748b' }}>Publicación y gestión de suscriptores</p>
        </div>

        {profile && (
          <div className="flex items-center gap-3 bg-white border border-brand-border px-3 py-1.5 rounded-xl shadow-sm">
            {profile.avatar ? (
              <img src={profile.avatar} className="w-8 h-8 rounded-full object-cover" alt="Profile" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-white font-bold text-xs">
                {(profile.name || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-[#0d1117] leading-none">{profile.name}</span>
              <span className="text-[10px] text-brand-secondary">@{profile.handle}</span>
            </div>
            <button onClick={disconnect} className="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 transition-colors ml-2 cursor-pointer">
              Salir
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Suscriptores',         value: profile?.subCount != null ? Number(profile.subCount).toLocaleString('es') : '—',   delta: '+12 este mes' },
          { label: 'Artículos publicados', value: profile?.followerCount != null ? Number(profile.followerCount).toLocaleString('es') : '—',    delta: 'Total histórico' },
          { label: 'Tasa de apertura',     value: '47%',   delta: 'Promedio' },
          { label: 'Total visitas',        value: '1,840', delta: 'Acumuladas' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#0d1117' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{s.delta}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: '#f1f5f9', display: 'inline-flex' }}>
        {([
          ['articles',    'Artículos'],
          ['subscribers', 'Suscriptores'],
          ['publish',     'Publicar'],
          ['notes',       'Notes'],
        ] as [SubTab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg transition-all text-xs font-bold border-none"
            style={{
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0d1117' : '#94a3b8',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Render */}
      {tab === 'stats'       && <SubstackStats />}
      {tab === 'subscribers' && <SubstackSubscribers />}
      {tab === 'publish'     && <SubstackPublish />}
      {tab === 'articles'    && <SubstackArticles onCompose={() => setTab('publish')} />}
      {tab === 'notes'       && <SubstackNotes />}
      {tab === 'detail'      && selectedPostId && <SubstackPostDetail postId={selectedPostId} onBack={() => { setSelectedPostId(null); setTab('articles'); }} />}
    </div>
  )
}

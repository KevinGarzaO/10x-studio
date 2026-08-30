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
  if (!substackConnected && !profile) {
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
    <div className="animate-fadein">
      {/* Verified Profile Card */}
      <div className="flex items-center gap-4 p-5 rounded-xl mb-6"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="relative flex-shrink-0 w-14 h-14">
          {profile?.avatar ? (
            <img src={profile.avatar} alt={profile?.name || 'Substack'} className="w-full h-full rounded-full object-cover border-2 border-white shadow-md" />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md" style={{ background: '#ff6719' }}>
              {(profile?.name || 'S')[0].toUpperCase()}
            </div>
          )}
          <div className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
            style={{ width: 18, height: 18, background: '#10b981', border: '2px solid #fff' }}>
            <svg width="8" height="8" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="flex-1">
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0d1117' }}>{profile?.name || 'Cargando...'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6719', letterSpacing: '0.02em' }}>PERFIL PROFESIONAL VERIFICADO</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#64748b' }}>
              <div className="rounded-full" style={{ width: 6, height: 6, background: '#10b981' }}/>
              Sesión Activa
            </div>
          </div>
        </div>
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

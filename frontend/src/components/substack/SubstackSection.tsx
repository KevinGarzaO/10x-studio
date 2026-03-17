'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { SubstackStats } from './SubstackStats'
import { SubstackPublish } from './SubstackPublish'
import { SubstackSubscribers } from './SubstackSubscribers'
import { api } from '@/lib/api'

type SubTab = 'stats' | 'subscribers' | 'publish'

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

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysUntil(expiresAt)
  if (days >= 60) return <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 rounded-full font-medium">✓ Sesión activa — {days} días</span>
  if (days > 14) return <span className="text-xs bg-[#e6f4ea] border border-[#bbf7d0] text-[#0d7c3d] px-3 py-1 rounded-full font-medium">✓ Sesión activa — {days} días</span>
  if (days > 5)  return <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full font-medium">⚠️ Expira en {days} días</span>
  return <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-full font-medium animate-pulse">🔴 Expira en {days} días</span>
}

export function SubstackSection() {
  const { substackConnected, substackPublication, reloadSubstackProfile } = useApp()
  const [tab, setTab]         = useState<SubTab>('stats')
  const [profile, setProfile] = useState<SubstackProfile | null>(null)
  const [autoSub, setAutoSub] = useState(true)
  const loadProfile = useCallback(async () => {
    try {
      const sub = await api<any>('/api/substack/profile')
      if (sub && !sub.error) {
        // Parse social_links — might be a JSON string in some DB setups
        let parsedLinks = sub.social_links || []
        if (typeof parsedLinks === 'string') {
          try { parsedLinks = JSON.parse(parsedLinks) } catch { parsedLinks = [] }
        }
        // Generate labels from type if missing
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
    await api('/api/substack/cookies', { method: 'DELETE' }) // Clear session
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

  if (!substackConnected) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📰</div>
          <h1 className="text-[28px] font-bold tracking-tight text-black mb-2">Conectar Substack</h1>
          <p className="text-[#9b9a97] text-sm leading-relaxed">
            Conecta tu cuenta usando la extensión de Chrome para publicar, ver estadísticas y gestionar suscriptores.
          </p>
        </div>
        <div className="bg-white border border-[#e9e9e7] rounded-lg overflow-hidden shadow-sm mb-6">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-5 py-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Cómo conectar</span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { n: '1', t: 'Instala la extensión', d: 'Descomprime substack-extension.zip → Chrome → chrome://extensions → Modo desarrollador → Cargar descomprimida.' },
              { n: '2', t: 'Inicia sesión en Substack', d: 'Ve a substack.com e inicia sesión con tu cuenta normalmente.' },
              { n: '3', t: 'Conecta desde la extensión', d: 'Clic en el ícono 10X en Chrome y presiona "Conectar Substack".' },
              { n: '4', t: 'Esta página se recarga sola', d: 'La extensión recarga tu app automáticamente y verás tu perfil aquí.' },
            ].map(step => (
              <div key={step.n} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{step.n}</div>
                <div>
                  <div className="text-sm font-semibold text-[#37352f]">{step.t}</div>
                  <div className="text-xs text-[#9b9a97] mt-0.5 leading-relaxed">{step.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature 1: Auto-subscription Checkbox */}
        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <input 
            type="checkbox" 
            id="autosub" 
            checked={autoSub} 
            onChange={e => setAutoSub(e.target.checked)}
            className="mt-1 w-4 h-4 accent-amber-600"
          />
          <label htmlFor="autosub" className="text-sm text-amber-900 font-medium leading-tight cursor-pointer">
            Quiero suscribirme al newsletter de Transformateck
            <span className="block text-[11px] text-amber-700/70 mt-0.5 font-normal">Recibe las últimas actualizaciones y noticias directamente en tu correo.</span>
          </label>
        </div>

        <button onClick={verifyAndSubscribe} className="btn btn-primary w-full py-3 shadow-lg hover:shadow-xl transition-all">
          🔄 Ya conecté — verificar
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-at text-[#9b9a97]"></i> Substack
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Publicación y gestión de suscriptores</p>
        </div>
      </div>

    {/* Profile card Rich UI */}
      {profile && (
        <div className="relative bg-white/60 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 md:p-8 mb-8 overflow-hidden group">
          {/* Decorative Background Blob */}
          <div className="absolute top-0 right-0 -mt-24 -mr-24 w-72 h-72 bg-gradient-to-br from-amber-400/20 to-orange-500/10 rounded-full blur-3xl pointer-events-none transition-transform duration-700 ease-out group-hover:scale-110" />

          <div className="relative flex items-start gap-6 md:gap-8 flex-wrap md:flex-nowrap">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {profile.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={profile.avatar} alt={profile.name}
                  className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-white shadow-md ring-1 ring-black/5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-tr from-stone-800 to-stone-600 flex items-center justify-center text-white font-bold text-4xl shadow-md ring-1 ring-black/5">
                  {(profile.name || substackPublication || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            
            {/* Core Info */}
            <div className="flex-1 min-w-0 pt-2">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <a href={profile.handle ? `https://substack.com/@${profile.handle}` : '#'} target="_blank" rel="noopener noreferrer" className="inline-flex flex-col items-start hover:opacity-80 transition-opacity">
                    <h2 className="text-3xl font-extrabold text-stone-900 tracking-tight">{profile.name || 'Usuario Substack'}</h2>
                    {profile.handle && <span className="text-stone-500 font-semibold mt-0.5 text-sm tracking-wide">@{profile.handle}</span>}
                  </a>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {profile.email && <span className="text-xs text-stone-600 px-2.5 py-1 bg-white/80 backdrop-blur-sm rounded-full border border-stone-200 shadow-sm font-medium truncate max-w-[200px]">{profile.email}</span>}
                    {substackPublication && (
                      <a href={`https://${profile.primaryPublication?.subdomain || profile.handle}.substack.com`} target="_blank" rel="noopener noreferrer" 
                         className="flex items-center gap-1.5 text-xs font-bold text-amber-900 px-3 py-1 bg-gradient-to-r from-amber-100 to-orange-50 hover:from-amber-200 hover:to-orange-100 border border-amber-200 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap">
                        {profile.pubLogo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={profile.pubLogo} className="w-4 h-4 rounded-sm object-cover shadow-sm" alt="Pub Logo" />
                        ) : (
                          <span className="text-sm">🗞️</span>
                        )}
                        {profile.primaryPublication?.name || profile.publication_name || substackPublication}
                      </a>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex flex-col gap-2.5 items-start md:items-end w-full md:w-auto mt-4 md:mt-0">
                  {profile.expiresAt && <ExpiryBadge expiresAt={profile.expiresAt} />}
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button onClick={disconnect} className="text-[11px] font-bold px-4 py-1.5 rounded-full border border-red-200 text-red-600 bg-white/50 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm">
                      Desconectar
                    </button>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="mt-5 text-[15px] text-stone-700 leading-relaxed max-w-3xl whitespace-pre-wrap font-medium">
                  {profile.bio.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                    part.match(/^https?:\/\//) ? (
                      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-800 underline decoration-amber-300 underline-offset-4 font-semibold break-all transition-colors">
                        {part.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>
              )}

              {/* Links & Stats row */}
              <div className="mt-7 flex flex-wrap items-center justify-between gap-6 border-t border-stone-200/60 pt-6">
                
                {/* Social Links */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {profile.links && profile.links.length > 0 && profile.links.map((link, i) => {
                    const icon = link.type === 'twitter' ? '𝕏' : link.type === 'linkedin' ? 'in' : '🔗';
                    return (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" 
                         className="flex items-center gap-1.5 text-[11px] font-bold text-stone-600 hover:text-stone-900 bg-white/50 hover:bg-white shadow-sm hover:shadow px-3 py-1.5 rounded-lg border border-stone-200 transition-all duration-300 hover:-translate-y-0.5">
                        <span className="opacity-90">{icon}</span>
                        {link.label || 'Enlace'}
                      </a>
                    )
                  })}
                </div>

                {/* Substack Metrics */}
                <div className="flex items-center gap-8 bg-white/40 px-5 py-2.5 rounded-2xl border border-stone-100 shadow-[inset_0_2px_10px_rgb(0,0,0,0.02)]">
                  <div className="text-center">
                    <div className="text-2xl font-black text-stone-900 tracking-tight leading-none">
                      {profile.subCount != null ? Number(profile.subCount).toLocaleString('es') : '—'}
                    </div>
                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1.5">Suscriptores</div>
                  </div>
                  <div className="w-px h-8 bg-stone-300/50"></div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-stone-900 tracking-tight leading-none">
                      {profile.followerCount != null ? Number(profile.followerCount).toLocaleString('es') : '—'}
                    </div>
                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1.5">Seguidores</div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Pill Tabs */}
      <div className="flex mb-8 overflow-x-auto no-scrollbar pb-2">
        <div className="inline-flex bg-stone-100/80 backdrop-blur-md p-1.5 rounded-2xl shadow-inner border border-stone-200/50 whitespace-nowrap">
          {([
            ['stats',       '📰 Publicaciones'],
            ['subscribers', '👥 Suscriptores'],
            ['publish',     '✍️ Publicar'],
          ] as [SubTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative px-4 md:px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${tab === t ? 'text-stone-900 bg-white shadow-sm ring-1 ring-black/5' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stats'       && <SubstackStats />}
      {tab === 'subscribers' && <SubstackSubscribers />}
      {tab === 'publish'     && <SubstackPublish />}
    </div>
  )
}

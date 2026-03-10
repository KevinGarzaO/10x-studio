'use client'
import { useState, useEffect, useCallback } from 'react'

interface StatsData {
  publication: { name: string; subdomain: string; url: string }
  subscribers: { total: number; free: number; paid: number }
  posts: {
    id: number; title: string; date: string; type: string
    likes: number; comments: number; views: number | null; openRate: number | null; url: string
  }[]
}

export function SubstackStats() {
  const [data,    setData]    = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true); setError('')
    let extensionCheckTimeout: any;
    try {
      // 1. Get the current pubId and pubSlug from our backend settings
      const infoRes = await fetch('/api/substack/connect')
      const info = await infoRes.json()
      
      if (!info || !info.connected) {
         setError('No estás conectado a Substack.')
         setLoading(false)
         return
      }
      
      const pubSlug = info.profile?.primaryPublication?.subdomain || info.publication
      const pubId = info.profile?.pubId || info.profile?.primaryPublication?.id
      
      if (!pubSlug || !pubId) {
         setError('Faltan datos de la publicación. Intenta reconectar la extensión.')
         setLoading(false)
         return
      }

      // 2. Ask the extension to fetch the stats to bypass Cloudflare
      // We do this by sending a message from the webpage to the extension background
      // Since this is a webpage talking to an extension, we use window.postMessage 
      // OR we can trigger logic if the extension injected a global function.
      // Easiest is to send a custom event that the extension's content script listens for.
      
      // Setting a timeout in case the extension doesn't respond
      const timeoutPromise = new Promise((_, reject) => 
         extensionCheckTimeout = setTimeout(() => reject(new Error('La extensión de Substack no respondió a tiempo. Asegúrate de tener una pestaña de Substack abierta y la extensión instalada.')), 10000)
      );
      
      const fetchPromise = new Promise<StatsData>((resolve, reject) => {
         const handleResponse = (event: MessageEvent) => {
            if (event.source !== window || !event.data || event.data.type !== 'SUBSTACK_STATS_RESPONSE') return;
            
            window.removeEventListener('message', handleResponse);
            clearTimeout(extensionCheckTimeout);
            
            if (event.data.error) {
               reject(new Error(event.data.error));
            } else {
               const stats = event.data.stats;
               // Format it to match expected state
               const d: StatsData = {
                  publication: { name: info.profile?.name || pubSlug, subdomain: pubSlug, url: `https://${pubSlug}.substack.com` },
                  subscribers: { total: stats.subs.total ?? 0, free: stats.subs.free ?? 0, paid: stats.subs.paid ?? 0 },
                  posts: Array.isArray(stats.posts) ? stats.posts.slice(0, 10).map((p: any) => ({
                    id:       p.id,
                    title:    p.title || 'Sin título',
                    date:     p.post_date?.slice(0, 10) ?? '',
                    type:     p.type,
                    likes:    p.reactions?.['❤'] ?? p.like_count ?? 0,
                    comments: p.comment_count ?? 0,
                    openRate: p.email_open_rate != null ? Math.round(p.email_open_rate * 100) : null,
                    views:    p.email_open_rate != null && p.email_sent_count
                                ? Math.round(p.email_sent_count * p.email_open_rate) : null,
                    url:      p.canonical_url ?? `https://${pubSlug}.substack.com`,
                  })) : []
               };
               resolve(d);
            }
         };
         
         window.addEventListener('message', handleResponse);
         window.postMessage({ type: 'REQUEST_SUBSTACK_STATS', pubId, pubSlug }, '*');
      });
      
      const d = await Promise.race([fetchPromise, timeoutPromise]) as StatsData;
      setData(d)
      
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }, []);

  useEffect(() => { loadStats() }, [loadStats])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-sm text-[#9b9a97]">Cargando estadísticas...</span>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-red-700 text-sm">
      <strong>Error:</strong> {error}
      <button onClick={loadStats} className="btn btn-secondary btn-sm ml-3">Reintentar</button>
    </div>
  )

  if (!data) return null

  const recentPosts = data.posts || [];
  const totalViews = recentPosts.reduce((acc, p) => acc + (p.views || 0), 0);
  const totalLikes = recentPosts.reduce((acc, p) => acc + (p.likes || 0), 0);
  const postsWithOpenRate = recentPosts.filter(p => p.openRate !== null);
  const avgOpenRate = postsWithOpenRate.length > 0 
    ? Math.round(postsWithOpenRate.reduce((acc, p) => acc + p.openRate!, 0) / postsWithOpenRate.length)
    : null;

  return (
    <div>

      {/* Posts KPIs Dashboard style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {[
          { label: 'Vistas Recientes', value: totalViews > 0 ? totalViews.toLocaleString() : '—', color: 'text-stone-900', bg: 'bg-stone-100' },
          { label: 'Likes Recientes',  value: totalLikes > 0 ? totalLikes.toLocaleString() : '—',  color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Apertura Promedio', value: avgOpenRate !== null ? `${avgOpenRate}%` : '—',  color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className="relative bg-white/80 backdrop-blur-xl border border-stone-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-2xl p-6 text-center hover:-translate-y-1 hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] hover:border-stone-300 transition-all duration-300 overflow-hidden group">
            <div className={`absolute -right-6 -top-6 w-24 h-24 ${k.bg} rounded-full blur-2xl opacity-50 group-hover:scale-150 transition-transform duration-500 pointer-events-none`} />
            <div className="relative">
              <div className={`text-4xl font-lack font-extrabold tracking-tight ${k.color}`}>{k.value}</div>
              <div className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mt-2">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent posts polished list */}
      <div className="bg-white/90 backdrop-blur-xl border border-stone-200/80 rounded-2xl shadow-[0_4px_24px_rgb(0,0,0,0.02)] overflow-hidden">
        <div className="bg-stone-50/80 border-b border-stone-200/80 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-800 tracking-wide">Publicaciones <span className="text-stone-500 font-medium">Recientes</span></h3>
        </div>
        {data.posts.length === 0 ? (
          <p className="text-center text-sm font-medium text-stone-500 py-10">No hay publicaciones aún</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {data.posts.map(p => (
              <div key={p.id} className="px-6 py-4 flex items-start gap-4 hover:bg-stone-50/50 transition-colors group">
                <div className="mt-1 w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center border border-stone-200/50 shadow-sm shrink-0">
                  <span className="text-lg">{p.type === 'newsletter' ? '📋' : '🗒️'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <a href={p.url} target="_blank" rel="noopener" className="text-base font-bold text-stone-900 hover:text-amber-700 transition-colors line-clamp-1 group-hover:underline underline-offset-4 decoration-stone-300">
                    {p.title}
                  </a>
                  <div className="flex gap-2.5 mt-2.5 flex-wrap">
                    <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-1 rounded-md">{p.date}</span>
                    <span className="text-[10px] font-bold text-red-600 bg-red-50/80 border border-red-100 px-2 py-1 rounded-md flex items-center gap-1">
                      <span className="text-[9px]">❤️</span> {p.likes.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50/80 border border-blue-100 px-2 py-1 rounded-md flex items-center gap-1">
                      <span className="text-[9px]">💬</span> {p.comments.toLocaleString()}
                    </span>
                    {p.openRate !== null && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50/80 border border-emerald-100 px-2 py-1 rounded-md flex items-center gap-1">
                        <span className="text-[9px]">📬</span> {p.openRate}%
                      </span>
                    )}
                    {p.views !== null && (
                      <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-1 rounded-md flex items-center gap-1">
                        <span className="text-[9px]">👁</span> {p.views.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

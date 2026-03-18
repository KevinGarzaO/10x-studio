'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

interface StatsData {
  publication: { name: string; subdomain: string; url: string }
  subscribers: { total: number; free: number; paid: number }
  posts: {
    id: string; title: string; date: string; type: string
    likes: number; comments: number; views: number | null; openRate: number | null; url: string
  }[]
}

export function SubstackStats() {
  const [data,    setData]    = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const loadStats = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 1. Get connection info
      const sub = await api<any>('/api/substack/profile')
      
      if (!sub || sub.error) {
         setError('No estás conectado a Substack.')
         setLoading(false)
         return
       }
      
      // 2. Fetch stats and posts from our backend
      const [stats, posts] = await Promise.all([
        api<any>(`/api/substack/stats`),
        api<any>(`/api/substack/posts`)
      ])

      if (stats.error) throw new Error(stats.error)
      if (posts.error) throw new Error(posts.error)

      // 3. Map to StatsData
      const pubSubdomain = sub.subdomain || sub.substack_slug
      const d: StatsData = {
        publication: { 
          name: sub.publication_name || sub.name || pubSubdomain, 
          subdomain: pubSubdomain, 
          url: `https://${pubSubdomain}.substack.com` 
        },
        subscribers: { 
          total: stats.subscriber_count ?? 0, 
          free: stats.subscriber_count ?? 0, // Backend doesn't split yet
          paid: 0 
        },
        posts: Array.isArray(posts) ? posts.slice(0, 10).map((p: any) => ({
          id:       p.post_id,
          title:    p.title || 'Sin título',
          date:     p.published_at?.slice(0, 10) ?? '',
          type:     'newsletter', // Default
          likes:    0,
          comments: 0,
          openRate: null,
          views:    null,
          url:      `https://${pubSubdomain}.substack.com/p/${p.post_id}`,
        })) : []
      }

      setData(d)
    } catch (e) { 
      setError(String(e)) 
    }
    setLoading(false)
  }, []);

  useEffect(() => { loadStats() }, [loadStats])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-sm text-brand-secondary font-medium tracking-tight">Cargando estadísticas...</span>
    </div>
  )

  if (error) return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-400 text-sm shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-xl">⚠️</span>
        <div className="font-medium">{error}</div>
      </div>
      <button onClick={() => loadStats()} className="btn btn-secondary px-6">
        Reintentar
      </button>
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Posts KPIs Dashboard style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: 'Suscriptores', value: (data.subscribers.total || 0).toLocaleString(), color: 'text-brand-primary', bg: 'bg-brand-bg' },
          { label: 'Likes Recientes',  value: (totalLikes || 0).toLocaleString(),  color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Apertura Promedio', value: avgOpenRate !== null ? `${avgOpenRate}%` : '0%',  color: 'text-green-400', bg: 'bg-green-500/10' },
        ].map(k => (
          <div key={k.label} className="relative bg-brand-surface border border-brand-border shadow-[var(--shadow)] rounded-2xl p-6 text-center hover:-translate-y-1 hover:border-brand-accent transition-all duration-300 overflow-hidden group">
            <div className={`absolute -right-6 -top-6 w-24 h-24 ${k.bg} rounded-full blur-2xl opacity-20 group-hover:scale-150 transition-transform duration-500 pointer-events-none`} />
            <div className="relative">
              <div className={`text-4xl font-bold tracking-tight ${k.color}`}>{k.value}</div>
              <div className="text-[11px] font-bold text-brand-secondary uppercase tracking-widest mt-2">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent posts polished list */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-[var(--shadow)] overflow-hidden">
        <div className="bg-brand-bg/50 border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-primary tracking-wide">Publicaciones <span className="text-brand-secondary font-medium">Recientes</span></h3>
        </div>
        {data.posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-20">📭</div>
            <p className="text-sm font-semibold text-brand-secondary">No hay publicaciones detectadas</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border">
            {data.posts.map(p => (
              <div key={p.id} className="px-6 py-4 flex items-start gap-4 hover:bg-brand-bg/50 transition-colors group">
                <div className="mt-1 w-11 h-11 rounded-xl bg-brand-bg flex items-center justify-center border border-brand-border shadow-sm shrink-0 group-hover:scale-110 transition-transform">
                  <span className="text-lg">{p.type === 'newsletter' ? '📋' : '🗒️'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2.5">
                    <a href={p.url} target="_blank" rel="noopener" className="text-base font-bold text-brand-primary hover:text-brand-accent transition-colors line-clamp-1 group-hover:underline underline-offset-4 decoration-brand-accent">
                      {p.title}
                    </a>
                  </div>
                  <div className="flex gap-2.5 mt-2.5 flex-wrap">
                    <span className="text-[10px] font-bold text-brand-secondary bg-brand-bg border border-brand-border px-2.5 py-1 rounded-md shadow-sm">{p.date}</span>
                    {p.likes > 0 && (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                        <span className="text-[9px]">❤️</span> {p.likes.toLocaleString()}
                      </span>
                    )}
                    {p.comments > 0 && (
                      <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                        <span className="text-[9px]">💬</span> {p.comments.toLocaleString()}
                      </span>
                    )}
                    {p.openRate !== null && (
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                        <span className="text-[9px]">📬</span> {p.openRate}%
                      </span>
                    )}
                    {p.views !== null && (
                      <span className="text-[10px] font-bold text-brand-secondary bg-brand-bg px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
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

'use client'
import { useState, useEffect } from 'react'
import { ArrowLeft, ExternalLink, Eye, Users, Share2, MousePointerClick, Mail, Loader2, BarChart3, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'

interface WebPostDetail {
  id: string
  title: string
  slug: string
  excerpt: string
  image_url: string | null
  published_at: string
  status: string
  word_count: number
  destination: string
  markdown_content: string
  analytics: {
    views: number
    unique_visitors: number
    share_clicks: number
    share_breakdown: Record<string, number>
    cta_clicks: number
    cta_breakdown: Record<string, number>
    subscribe_submits: number
    max_scroll_depth: number
    total_events: number
  }
  post_url: string
}

export function WebPostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const [post, setPost] = useState<WebPostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await api<any>(`/api/blog/web-posts/${postId}`)
        if (data && !data.error && data.id) {
          setPost(data)
        } else {
          setError('Post no encontrado')
        }
      } catch {
        setError('Error al cargar el post')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [postId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin w-8 h-8 text-brand-accent" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="text-center py-10">
        <p className="text-brand-secondary">{error || 'Post no encontrado'}</p>
        <button onClick={onBack} className="btn btn-primary mt-4">Volver</button>
      </div>
    )
  }

  const formattedDate = new Date(post.published_at).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const analytics = post.analytics

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-brand-bg rounded-lg text-brand-secondary hover:text-brand-primary transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-brand-primary">Blog Web</h1>
      </div>

      {/* Post Card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          {post.image_url ? (
            <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 relative border border-white/10">
              <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-xl bg-brand-bg flex items-center justify-center text-brand-secondary flex-shrink-0">
              <BarChart3 size={32} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-brand-primary leading-snug">{post.title}</h2>
            <p className="text-sm text-brand-secondary mt-1">
              Publicado {formattedDate} • {post.word_count ? `${post.word_count} palabras` : ''}
            </p>
          </div>
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary text-sm whitespace-nowrap"
          >
            Ver Post <ExternalLink size={14} className="ml-1.5" />
          </a>
        </div>
      </div>

      {/* Metrics Tabs */}
      <div className="flex gap-1 mb-6 bg-brand-surface border border-brand-border rounded-xl p-1 overflow-x-auto">
        {['Descripción general', 'Alcance', 'Compromiso', 'Growth'].map((tab, i) => (
          <button key={tab} className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
            i === 0 ? 'bg-[#3b3b3b] text-white' : 'text-brand-secondary hover:text-brand-primary'
          }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Visitas totales</span>
            <Eye size={16} className="text-brand-accent" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{analytics.views}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Visitantes únicos</span>
            <Users size={16} className="text-brand-accent" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{analytics.unique_visitors}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Scroll máximo</span>
            <TrendingUp size={16} className="text-brand-accent" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{analytics.max_scroll_depth}%</div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Shares */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <Share2 size={16} className="text-brand-accent" /> Shares por plataforma
          </h3>
          <div className="space-y-3">
            {Object.keys(analytics.share_breakdown).length > 0 ? (
              Object.entries(analytics.share_breakdown).map(([platform, count]) => (
                <div key={platform} className="flex items-center justify-between">
                  <span className="text-sm text-brand-secondary capitalize">{platform}</span>
                  <span className="text-sm font-bold text-brand-primary">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-brand-secondary">Sin datos de shares</p>
            )}
            <div className="flex items-center justify-between border-t border-brand-border pt-2">
              <span className="text-sm font-bold text-brand-secondary">Total</span>
              <span className="text-sm font-bold text-brand-accent">{analytics.share_clicks}</span>
            </div>
          </div>
        </div>

        {/* CTA Clicks */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <MousePointerClick size={16} className="text-brand-accent" /> CTAs clickeados
          </h3>
          <div className="space-y-3">
            {Object.keys(analytics.cta_breakdown).length > 0 ? (
              Object.entries(analytics.cta_breakdown).map(([name, count]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm text-brand-secondary">{name}</span>
                  <span className="text-sm font-bold text-brand-primary">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-brand-secondary">Sin datos de CTAs</p>
            )}
            <div className="flex items-center justify-between border-t border-brand-border pt-2">
              <span className="text-sm font-bold text-brand-secondary">Total</span>
              <span className="text-sm font-bold text-brand-accent">{analytics.cta_clicks}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscribe & Events */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <Mail size={16} className="text-brand-accent" /> Suscripciones
          </h3>
          <div className="text-center py-4">
            <div className="text-4xl font-extrabold text-brand-primary">{analytics.subscribe_submits}</div>
            <div className="text-xs font-bold text-brand-secondary uppercase tracking-wider mt-2">formularios enviados</div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-accent" /> Resumen de eventos
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-brand-bg rounded-xl">
              <div className="text-lg font-bold text-brand-primary">{analytics.views}</div>
              <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Page views</div>
            </div>
            <div className="text-center p-3 bg-brand-bg rounded-xl">
              <div className="text-lg font-bold text-brand-primary">{analytics.share_clicks}</div>
              <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Shares</div>
            </div>
            <div className="text-center p-3 bg-brand-bg rounded-xl">
              <div className="text-lg font-bold text-brand-primary">{analytics.cta_clicks}</div>
              <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">CTA clicks</div>
            </div>
            <div className="text-center p-3 bg-brand-bg rounded-xl">
              <div className="text-lg font-bold text-brand-primary">{analytics.total_events}</div>
              <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Total eventos</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { ArrowLeft, ExternalLink, Eye, Users, Mail, Heart, MessageCircle, MousePointerClick, BarChart3, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { api } from '@/lib/api'

interface PostDetail {
  id: string
  post_id: string
  title: string
  subtitle: string | null
  cover_image_url: string | null
  published_at: string
  audience: string
  post_type: string
  word_count: number
  signups: number
  views: number
  open_rate: number
  reaction_count: number
  likes: number
  comment_count: number
  subdomain: string
  post_url: string
  synced_at: string
}

export function SubstackPostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const { substackPublication } = useApp()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await api<any>(`/api/substack/posts/detail/${postId}`)
        if (data && !data.error && data.post_id) {
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

  const subdomain = post.subdomain || substackPublication || 'transformateck'
  const formattedDate = new Date(post.published_at).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const openRatePercent = post.open_rate ? `${(post.open_rate * 100).toFixed(1)}%` : '0%'
  const openRateSubtitle = post.open_rate && post.views
    ? `${Math.round(post.open_rate * post.views)} abre`
    : ''

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-brand-bg rounded-lg text-brand-secondary hover:text-brand-primary transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-brand-primary">Posts</h1>
      </div>

      {/* Post Card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          {post.cover_image_url ? (
            <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 relative border border-white/10">
              <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
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
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{post.views || 0}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Destinatarios</span>
            <Users size={16} className="text-brand-accent" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{post.signups || 0}</div>
          {post.signups > 0 && (
            <span className="text-xs text-brand-accent mt-1 block">Ver detalles</span>
          )}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Tasa de apertura</span>
            <Mail size={16} className="text-brand-accent" />
          </div>
          <div className="text-3xl font-extrabold text-brand-primary tracking-tight">{openRatePercent}</div>
          {openRateSubtitle && (
            <span className="text-xs text-brand-secondary mt-1 block">{openRateSubtitle} abre</span>
          )}
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Engagement */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <Heart size={16} className="text-brand-accent" /> Compromiso
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-secondary">Me gusta</span>
              <span className="text-sm font-bold text-brand-primary">{post.likes || post.reaction_count || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-secondary">Comentarios</span>
              <span className="text-sm font-bold text-brand-primary">{post.comment_count || 0}</span>
            </div>
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
            <MousePointerClick size={16} className="text-brand-accent" /> Enlaces clicados
          </h3>
          <div className="space-y-3">
            {post.views > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-secondary">Tasa de clics</span>
                  <span className="text-sm font-bold text-brand-primary">
                    {post.comment_count > 0 ? `${Math.round((post.comment_count / post.views) * 100)}%` : '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-secondary">Fuentes de tráfico</span>
                  <span className="text-sm font-bold text-brand-primary">email 100%</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-brand-secondary">Sin datos de tráfico disponibles</p>
            )}
          </div>
        </div>
      </div>

      {/* Full Stats Row */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-brand-accent" /> Métricas completas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-brand-bg rounded-xl">
            <div className="text-lg font-bold text-brand-primary">{post.views || 0}</div>
            <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Visitas</div>
          </div>
          <div className="text-center p-3 bg-brand-bg rounded-xl">
            <div className="text-lg font-bold text-brand-primary">{post.signups || 0}</div>
            <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Suscripciones</div>
          </div>
          <div className="text-center p-3 bg-brand-bg rounded-xl">
            <div className="text-lg font-bold text-brand-primary">{openRatePercent}</div>
            <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Apertura</div>
          </div>
          <div className="text-center p-3 bg-brand-bg rounded-xl">
            <div className="text-lg font-bold text-brand-primary">{post.likes || post.reaction_count || 0}</div>
            <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Me gusta</div>
          </div>
          <div className="text-center p-3 bg-brand-bg rounded-xl">
            <div className="text-lg font-bold text-brand-primary">{post.comment_count || 0}</div>
            <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mt-1">Comentarios</div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { ExternalLink, MoreHorizontal, Loader2, Eye, Users, Share2, MousePointerClick, Mail } from 'lucide-react'
import { api } from '@/lib/api'

interface WebPost {
  id: string
  title: string
  slug: string
  excerpt: string
  image_url: string | null
  published_at: string
  status: string
  word_count: number
  destination: string
  stats: {
    views: number
    unique_visitors: number
    share_clicks: number
    cta_clicks: number
    subscribe_submits: number
  }
  post_url: string
}

interface APIResponse {
  posts: WebPost[]
  total: number
}

const PAGE_SIZE = 15

const fetcher = (url: string) => api<APIResponse>(url)

export function WebArticles({ onPostClick }: { onPostClick?: (postId: string) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { data, error, isLoading } = useSWR<APIResponse>(
    `/api/blog/web-posts?status=published&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    fetcher
  )

  const posts = data?.posts || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const filteredPosts = posts.filter((post: WebPost) =>
    post.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-brand-primary">Publicado</span>
          <span className="text-[11px] font-bold bg-[#1e1e1e] text-[#a0a0a0] px-2 py-0.5 rounded-full min-w-[24px] text-center shadow-inner">
            {data ? total : '—'}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-accent transition-colors"
          />
        </div>
      </div>

      <div className="card overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-brand-secondary">
            <Loader2 className="animate-spin w-6 h-6" />
          </div>
        ) : error ? (
          <div className="h-40 flex flex-col items-center justify-center text-brand-secondary p-8 text-center">
            <p className="text-red-400 mb-2">Error al cargar artículos</p>
            <p className="text-xs opacity-70">Verifica que el backend esté activo</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-brand-secondary text-sm">
            No se encontraron artículos {search && 'con esa búsqueda'}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredPosts.map((post: WebPost, idx: number) => (
              <div
                key={post.id}
                onClick={() => onPostClick?.(post.id)}
                className={`flex items-center p-4 gap-4 ${idx !== filteredPosts.length - 1 ? 'border-b border-white/5' : ''} hover:bg-white/5 transition-colors cursor-pointer group`}
              >
                {/* Thumbnail */}
                <div className="w-28 h-16 rounded-md overflow-hidden bg-brand-bg flex-shrink-0 relative border border-white/10 flex items-center justify-center text-brand-secondary">
                  {post.image_url ? (
                    <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 opacity-50">
                      <span className="text-[10px]">No image</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="font-bold text-sm text-brand-primary truncate">{post.title}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-brand-secondary truncate">
                    <span>
                      {post.published_at
                        ? new Date(post.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                        : 'Sin fecha'}
                    </span>
                    <span>•</span>
                    <span className="truncate">Kevin Garza</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-brand-secondary opacity-80">
                    {post.word_count > 0 && <span>{post.word_count} palabras</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 pl-8 border-l border-white/10 text-xs">
                  <div className="flex flex-col">
                    <span className="text-brand-primary font-bold text-[13px]">{post.stats.views}</span>
                    <span className="text-brand-secondary text-[11px]">Visitas</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-brand-primary font-bold text-[13px]">{post.stats.unique_visitors}</span>
                    <span className="text-brand-secondary text-[11px]">Visitantes</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-brand-primary font-bold text-[13px]">{post.stats.share_clicks}</span>
                    <span className="text-brand-secondary text-[11px]">Shares</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-brand-primary font-bold text-[13px]">{post.stats.subscribe_submits}</span>
                    <span className="text-brand-secondary text-[11px]">Suscripciones</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pl-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onPostClick?.(post.id); }}
                    className="p-2 hover:bg-brand-bg rounded-md text-brand-secondary hover:text-brand-primary transition-colors"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button className="p-2 hover:bg-brand-bg rounded-md text-brand-secondary hover:text-brand-primary transition-colors">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-4">
        <span className="text-xs text-brand-secondary">
          {data ? `Mostrando ${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, total)} de ${total} posts` : 'Cargando...'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg border border-brand-border text-xs font-bold text-brand-secondary hover:text-brand-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-xs text-brand-secondary px-2">
            {page + 1} / {totalPages || 1}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-brand-border text-xs font-bold text-brand-secondary hover:text-brand-primary hover:bg-brand-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}

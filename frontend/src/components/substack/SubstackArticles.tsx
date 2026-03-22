'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useApp } from '@/components/layout/AppProvider'
import { ExternalLink, MoreHorizontal, Loader2, Mail, Users, MousePointerClick, CalendarClock, Edit3, Send } from 'lucide-react'
import Image from 'next/image'

import { api } from '@/lib/api'

type ArticleType = 'published' | 'scheduled' | 'drafts'

interface APIResponse {
  posts: any[]
  offset: number
  limit: number
  total: number
}

const fetcher = (url: string) => api<any>(url)

export function SubstackArticles() {
  const { substackConnected } = useApp()
  const [activeTab, setActiveTab] = useState<ArticleType>('published')
  const [search, setSearch] = useState('')

  // Mapping states to endpoint parameters
  const endpointMap = {
    published: 'published?order_by=post_date&order_direction=desc',
    scheduled: 'scheduled?order_by=trigger_at&order_direction=asc',
    drafts: 'drafts?order_by=draft_updated_at&order_direction=desc'
  }

  const { data, error, isLoading } = useSWR<APIResponse>(
    substackConnected ? `/api/substack/posts/${endpointMap[activeTab]}&limit=25&offset=0` : null,
    fetcher
  )

  const posts = data?.posts || []

  // Simple client-side search filter
  const filteredPosts = posts.filter(post => 
    (post.title || post.draft_title || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <div className="flex bg-brand-bg border border-brand-border rounded-lg p-1 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab('published')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'published' ? 'bg-[#3b3b3b] text-white' : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            Publicado <span className="text-[10px] bg-brand-border px-1.5 py-0.5 rounded-full">{activeTab === 'published' ? filteredPosts.length : ''}</span>
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'scheduled' ? 'bg-[#3b3b3b] text-white' : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            Programado
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'drafts' ? 'bg-[#3b3b3b] text-white' : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            Borradores
          </button>
        </div>
        
        <button className="bg-[#6b21a8] hover:bg-[#581c87] text-white px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
          Crear <span className="text-[10px]">▼</span>
        </button>
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
        <button className="flex items-center gap-2 bg-brand-surface border border-brand-border px-4 py-2 rounded-lg text-sm font-semibold text-brand-primary hover:bg-brand-border transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          Filter
        </button>
        <button className="flex items-center gap-2 bg-brand-surface border border-brand-border px-4 py-2 rounded-lg text-sm font-semibold text-brand-primary hover:bg-brand-border transition-colors">
          Primero los más nuevos <span className="text-[10px]">▼</span>
        </button>
      </div>

      <div className="card overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-brand-secondary">
            <Loader2 className="animate-spin w-6 h-6" />
          </div>
        ) : error ? (
          <div className="h-40 flex flex-col items-center justify-center text-brand-secondary p-8 text-center">
            <p className="text-red-400 mb-2">Error al cargar artículos</p>
            <p className="text-xs opacity-70">Asegúrate de que el backend esté conectado a Substack</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-brand-secondary text-sm">
            No se encontraron artículos {search && 'con esa búsqueda'}
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredPosts.map((post, idx) => (
              <div key={post.id} className={`flex items-center p-4 gap-4 ${idx !== filteredPosts.length - 1 ? 'border-b border-brand-border/50' : ''} hover:bg-white/5 transition-colors cursor-pointer group`}>
                
                {/* Thumbnail */}
                <div className="w-28 h-16 rounded-md overflow-hidden bg-brand-bg flex-shrink-0 relative border border-brand-border/50 flex items-center justify-center text-brand-secondary">
                  {post.cover_image ? (
                    <img src={post.cover_image} alt={post.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 opacity-50">
                      <span className="text-xs">No image</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="font-bold text-sm text-brand-primary truncate">{post.title || post.draft_title}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-brand-secondary truncate">
                    <span>
                      {activeTab === 'scheduled' && post.trigger_at ? (
                        <>Programado para {new Date(post.trigger_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</>
                      ) : activeTab === 'drafts' ? (
                        <>Modificado {new Date(post.draft_updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</>
                      ) : (
                        <>{new Date(post.post_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</>
                      )}
                    </span>
                    <span>•</span>
                    <span className="truncate">{post.publishedBylines?.[0]?.name || post.bylines?.[0]?.name || 'Autor'}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-brand-secondary">
                    <span className="flex items-center gap-1"><span className="opacity-70">♡</span> {post.reactions?.['❤'] || 0}</span>
                    <span className="flex items-center gap-1"><span className="opacity-70">🗨</span> {post.comment_count || 0}</span>
                    {post.type === 'adhoc_email' && (
                      <span className="flex items-center gap-1 bg-brand-surface px-1.5 py-0.5 rounded text-[10px] border border-brand-border">Correo electrónico</span>
                    )}
                  </div>
                </div>

                {/* Stats (only for published) */}
                {activeTab === 'published' && post.stats && (
                  <div className="flex items-center gap-8 pl-4 border-l border-brand-border/50 text-xs">
                    <div className="flex flex-col">
                      <span className="text-brand-primary font-medium">{post.stats.signups || 0}</span>
                      <span className="text-brand-secondary text-[11px]">Subscripciones</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-brand-primary font-medium">{post.stats.views || 0}</span>
                      <span className="text-brand-secondary text-[11px]">Visitas</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-brand-primary font-medium">{post.stats.open_rate ? `${Math.round(post.stats.open_rate * 100)}%` : '0%'}</span>
                      <span className="text-brand-secondary text-[11px]">Abierto</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pl-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 hover:bg-brand-bg rounded-md text-brand-secondary hover:text-brand-primary transition-colors">
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
    </div>
  )
}

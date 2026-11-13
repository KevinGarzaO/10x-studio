'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/layout/AppProvider'
import { api } from '@/lib/api'

type ArticleType = 'published' | 'scheduled' | 'drafts'

interface APIResponse {
  posts: any[]
  offset: number
  limit: number
  total: number
}

const fetcher = (url: string) => api<any>(url)

const PAGE_SIZE = 15

export function SubstackArticles({ onCompose }: { onCompose?: () => void }) {
  const router = useRouter()
  const { substackConnected } = useApp()
  const [activeTab, setActiveTab] = useState<ArticleType>('published')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const offset = page * PAGE_SIZE

  const publishedSWR = useSWR<APIResponse>(
    substackConnected ? `/api/substack/posts/published?order_by=post_date&order_direction=desc&limit=${PAGE_SIZE}&offset=${offset}` : null,
    fetcher
  )
  const scheduledSWR = useSWR<APIResponse>(
    substackConnected ? `/api/substack/posts/scheduled?order_by=trigger_at&order_direction=asc&limit=${PAGE_SIZE}&offset=${offset}` : null,
    fetcher
  )
  const draftsSWR = useSWR<APIResponse>(
    substackConnected ? `/api/substack/posts/drafts?order_by=draft_updated_at&order_direction=desc&limit=${PAGE_SIZE}&offset=${offset}` : null,
    fetcher
  )

  const handleTabChange = (tab: ArticleType) => {
    setActiveTab(tab)
    setPage(0)
  }

  const activeSWR = activeTab === 'published' ? publishedSWR : activeTab === 'scheduled' ? scheduledSWR : draftsSWR
  const { data, error, isLoading } = activeSWR

  const posts = data?.posts || []
  const total = data?.total || posts.length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const filteredPosts = posts.filter((post: any) =>
    (post.title || post.draft_title || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center rounded-lg px-3 py-1.5"
            style={{ background: '#0d1117', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            Publicado
          </div>
          <span className="flex items-center justify-center rounded-full text-white"
            style={{ width: 22, height: 22, fontSize: 11, fontWeight: 700, background: '#0d1117' }}>
            {publishedSWR.data ? publishedSWR.data.posts.length : '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 rounded-lg"
            style={{ height: 36, background: '#fff', border: '1px solid var(--border)', minWidth: 200 }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" style={{ color: '#94a3b8' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar artículos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, width: '100%', color: '#0d1117' }}
            />
          </div>
          <button
            onClick={onCompose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-all"
            style={{
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-heading)',
              background: 'linear-gradient(135deg,#ef4444,#dc2626)',
              boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            Crear artículo
          </button>
        </div>
      </div>

      {/* Article list */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {/* Table header */}
        <div className="grid px-5 py-3" style={{
          gridTemplateColumns: '1fr 80px 60px 60px 60px 80px 40px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase'
        }}>
          <div>Título</div>
          <div className="text-center">Suscripciones</div>
          <div className="text-center">Visitas</div>
          <div className="text-center">Apertura</div>
          <div className="text-center">Likes</div>
          <div className="text-center">Estado</div>
          <div />
        </div>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center" style={{ color: '#94a3b8' }}>
            <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: '#e2e8f0', borderTopColor: '#10b981' }} />
          </div>
        ) : error ? (
          <div className="h-40 flex flex-col items-center justify-center p-8 text-center" style={{ color: '#94a3b8' }}>
            <p style={{ color: '#ef4444', marginBottom: 8 }}>Error al cargar artículos</p>
            <p style={{ fontSize: 12, opacity: 0.7 }}>Asegúrate de que el backend esté conectado a Substack</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
            No se encontraron artículos {search && 'con esa búsqueda'}
          </div>
        ) : (
          filteredPosts.map((post: any, i: number) => (
            <div
              key={post.id}
              className="grid items-center px-5 py-3.5 cursor-pointer transition-all"
              style={{
                gridTemplateColumns: '1fr 80px 60px 60px 60px 80px 40px',
                borderBottom: i < filteredPosts.length - 1 ? '1px solid #f8f9fb' : 'none',
              }}
              onClick={() => router.push(`/substack/${post.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 rounded" style={{ width: 36, height: 36, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ color: '#94a3b8' }}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1117', lineHeight: 1.3 }}>{post.title || post.draft_title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {activeTab === 'scheduled' && post.trigger_at
                        ? `Programado ${new Date(post.trigger_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                        : activeTab === 'drafts'
                          ? `Modificado ${new Date(post.draft_updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
                          : post.post_date ? new Date(post.post_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Sin fecha'
                      } · Kevin Garza
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center" style={{ fontSize: 14, fontWeight: 700, color: '#0d1117' }}>{post.stats?.signups || 0}</div>
              <div className="text-center" style={{ fontSize: 14, fontWeight: 700, color: '#0d1117' }}>{post.stats?.views || 0}</div>
              <div className="text-center" style={{ fontSize: 14, fontWeight: 700, color: post.stats?.open_rate ? '#10b981' : '#94a3b8' }}>
                {post.stats?.open_rate ? `${Math.round(post.stats.open_rate * 100)}%` : '—'}
              </div>
              <div className="text-center" style={{ fontSize: 14, fontWeight: 700, color: '#0d1117' }}>{post.likes || post.reactions?.total || 0}</div>
              <div className="text-center">
                <span className="px-2 py-1 rounded-lg" style={{
                  fontSize: 10.5, fontWeight: 600,
                  background: activeTab === 'published' ? 'rgba(16,185,129,0.1)' : activeTab === 'scheduled' ? 'rgba(245,158,11,0.1)' : 'rgba(148,163,184,0.1)',
                  color: activeTab === 'published' ? '#10b981' : activeTab === 'scheduled' ? '#f59e0b' : '#94a3b8',
                }}>
                  {activeTab === 'published' ? 'Publicado' : activeTab === 'scheduled' ? 'Agendado' : 'Borrador'}
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/substack/${post.id}`); }}
                  className="flex items-center justify-center rounded-lg transition-all"
                  style={{ width: 28, height: 28, color: '#94a3b8', background: '#f8f9fb' }}
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!isLoading && filteredPosts.length > 0 && (
        <div className="flex items-center justify-between py-2">
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} de {total} posts
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: '1px solid var(--border)', color: '#64748b', background: '#fff', opacity: page === 0 ? 0.3 : 1, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
            >
              Anterior
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8', padding: '0 8px' }}>
              {page + 1} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ border: '1px solid var(--border)', color: '#64748b', background: '#fff', opacity: page >= totalPages - 1 ? 0.3 : 1, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

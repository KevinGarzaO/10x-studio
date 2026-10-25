'use client'

import { useParams, useRouter } from 'next/navigation'
import { renderUserMarkdown } from '../../../../lib/user-markdown'
import { clearFeedCache } from '../../../../components/community-hub'
import { getToken } from '../../../../lib/session'
import { PostStats } from '../../../../components/post-stats'
import { excerptRepeatsBody, promoteCapsHeadings } from '../../../../lib/article-html'
import { useState, useEffect } from 'react'
import { LockKeyhole } from 'lucide-react'
import { marked } from 'marked'
import { useShell } from '../../../../lib/shell-context'
import { DetailHeader } from '../../../../components/post-detail/DetailHeader'
import { DetailFooter } from '../../../../components/post-detail/DetailFooter'
import { DetailConversation, type DetailComment } from '../../../../components/post-detail/DetailConversation'
import { commentsOf, createComment } from '../../../../lib/post-comments'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

marked.setOptions({ breaks: true, gfm: true })

interface PostData {
  id: string
  type: string
  title: string
  content?: string
  excerpt?: string
  author: { id: string | null; username: string; display_name: string; photo_url: string | null }
  tags: string[]
  votesCount: number
  /** Si quien mira ya votó (discusiones y proyectos). */
  hasVoted?: boolean
  commentsCount: number
  image_url?: string | null
  slug?: string
  word_count?: number
  created_at: string
  comments?: DetailComment[]
  community_comments?: DetailComment[]
}

function formatTime(dateStr: string) {
  if (!dateStr) return 'reciente'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days}d`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function maskContact(content: string): string {
  const lines = content.split('\n')
  const contactStart = lines.findIndex(l => /###\s*Contacto/i.test(l))
  if (contactStart < 0) return content

  const before = lines.slice(0, contactStart).join('\n')
  const masked = [
    '',
    '### Contacto',
    '',
    '<div style="padding:16px;background:var(--surface-2);border-radius:10px;text-align:center;border:1px dashed var(--line)">',
    '<p style="color:var(--text-muted);margin:0 0 8px">🔒 Regístrate para ver los datos de contacto</p>',
    '<p style="color:var(--text-muted);margin:0;font-size:13px">Email, teléfono, WhatsApp y enlace de aplicación</p>',
    '</div>',
  ].join('\n')

  return [before, masked].join('\n')
}

const TYPE_LABELS: Record<string, string> = {
  editorial: 'ARTÍCULO',
  showcase: 'PROYECTO',
  discussion: 'DISCUSIÓN',
  job: 'VACANTE',
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, requestAuth } = useShell()
  // router.back() returns to whatever page the user actually came from
  // (feed, another post, a search) instead of a fixed guess at the tab.
  const goBack = () => router.back()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [votes, setVotes] = useState(0)
  const [voted, setVoted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [comments, setComments] = useState<DetailComment[]>([])
  const [sent, setSent] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  // Opening a post shouldn't inherit whatever scroll depth the feed was at —
  // it should always start at the top. router.back() to return to the feed
  // still uses the browser's own scroll restoration, so that side is
  // untouched.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    setLoading(true)
    setError(null)

    const token = getToken()
    fetch(`${API_URL}/api/community/posts/${id}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then(res => {
        if (!res.ok) throw new Error('Post no encontrado')
        return res.json()
      })
      .then(data => {
        setPost(data)
        setComments(commentsOf(data))
        setVotes(data.votesCount || 0)
        setVoted(!!data.hasVoted)
        setLoading(false)
      })
      .catch(() => {
        setError('Publicación no encontrada')
        setLoading(false)
      })
  }, [id])

  if (loading || error || !post) {
    return (
      <div className="detail-page">
        <button onClick={goBack} className="detail-back">Volver al feed</button>
        <p style={{ color: 'var(--text-muted)' }}>
          {loading ? 'Cargando publicación...' : 'Publicación no encontrada'}
        </p>
      </div>
    )
  }

  const isJob = post.type === 'job'
  // Lo que escriben los miembros se muestra con el convertidor seguro; el contenido del equipo conserva su HTML.
  const isMemberPost = post.type === 'discussion' || post.type === 'showcase'
  const canDelete = isMemberPost && !!user && (user.id === post.author?.id || user.user_kind === 'superadmin')
  // A post only has no real author when it fell back to the CMS "content"
  // table (backend marks that with author.id === null) — genuine AvoTalent
  // editorial content.
  const hasRealAuthor = !!post.author?.id
  const authorName = hasRealAuthor ? (post.author?.display_name || post.author?.username || 'Anónimo') : 'AvoTalent'
  const initials = hasRealAuthor
    ? authorName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'AT'

  async function voteOnPost() {
    if (!isMemberPost) { setVoted(value => !value); return }
    if (!user) { requestAuth(); return }
    const next = !voted
    setVoted(next)
    try {
      const res = await fetch(`${API_URL}/api/community/posts/${post!.id}/vote`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) setVoted(!next)
    } catch {
      setVoted(!next)
    }
  }

  async function deletePost() {
    if (deleting || !window.confirm('¿Eliminar esta publicación? No se puede deshacer.')) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/community/posts/${post!.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } })
      if (res.ok) {
        clearFeedCache()
        router.push('/')
        return
      }
    } catch {
      // se queda en la página y se puede intentar de nuevo
    }
    setDeleting(false)
  }

  const displayContent = (isJob && !user && post.content) ? maskContact(post.content) : post.content
  // Solo artículos y showcase llevan imagen: una discusión es texto, y un
  // placeholder rayado ahí sería ruido. Y si el cuerpo ya trae la imagen
  // (los artículos del CMS la incluyen en su markdown), no se repite arriba.
  const bodyHasImage = /<img|!\[/.test(displayContent || '')
  const showsMedia = (post.type === 'editorial' || post.type === 'showcase') && !bodyHasImage

  return (
    <div className="detail-page">
      <DetailHeader
        onBack={goBack}
        authorName={authorName}
        initials={initials}
        photoUrl={hasRealAuthor ? post.author?.photo_url : null}
        profileHref={hasRealAuthor && post.author?.username ? `/users/${post.author.username}` : null}
        typeLabel={TYPE_LABELS[post.type] || 'PUBLICACIÓN'}
        time={formatTime(post.created_at)}
        verified={!hasRealAuthor}
      />

      <h1>{post.title}</h1>

      {!isJob && (
        <PostStats
          votes={Math.max(0, votes + (voted ? 1 : 0) - (post.hasVoted ? 1 : 0))}
          voted={voted}
          onVote={voteOnPost}
          comments={comments.length || post.commentsCount || 0}
          readMinutes={post.word_count ? Math.max(1, Math.round(post.word_count / 200)) : null}
          detailed
        />
      )}

      {showsMedia && (
        post.image_url
          ? <div className="detail-media"><img src={post.image_url} alt={post.title} /></div>
          : <div className="detail-media is-placeholder"><span>{TYPE_LABELS[post.type]}</span></div>
      )}

      {post.excerpt && !excerptRepeatsBody(post.excerpt, displayContent) && <p className="detail-lead">{post.excerpt}</p>}

      {displayContent && (
        <div
          className="detail-body editorial-content"
          dangerouslySetInnerHTML={{ __html: isMemberPost ? renderUserMarkdown(displayContent) : promoteCapsHeadings(marked.parse(displayContent) as string) }}
        />
      )}

      {isJob && !user && (
        <div className="detail-guest-cta">
          <LockKeyhole size={24} />
          <h3>¿Interesado en esta vacante?</h3>
          <p>Regístrate para acceder al email, teléfono, WhatsApp y enlace de aplicación.</p>
          <button type="button" className="detail-action" onClick={requestAuth}>Crear cuenta gratis</button>
        </div>
      )}

      {post.tags && post.tags.length > 0 && (
        <div className="detail-tags">
          {post.tags.map(tag => <span key={tag}>#{tag}</span>)}
        </div>
      )}

      <DetailFooter
        commentsCount={comments.length || post.commentsCount || 0}
        saved={saved}
        onSave={() => (user ? setSaved(!saved) : requestAuth())}
        conversationHref={isJob ? undefined : '#conversation'}
      />

      {canDelete && (
        <div className="detail-owner-actions">
          <button type="button" className="detail-delete" onClick={deletePost} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar publicación'}</button>
        </div>
      )}

      {!isJob && (
        <DetailConversation
          comments={comments}
          currentUserInitials={user ? (user.display_name || user.username || 'U').slice(0, 2).toUpperCase() : null}
          onSubmit={async text => {
            setSent(false)
            setCommentError(null)
            const result = await createComment(post.id, text)
            if ('error' in result) { setCommentError(result.error); return }
            setComments(prev => [result.comment, ...prev])
            setSent(true)
          }}
          formatTime={formatTime}
          sent={sent}
          error={commentError}
        />
      )}
    </div>
  )
}

import { getToken } from './session'
import type { DetailComment } from '../components/post-detail/DetailConversation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/**
 * Los comentarios de una publicación, más recientes primero.
 *
 * `GET /posts/:id` los devuelve en `community_comments` (el nombre de la
 * relación en la base); `comments` se acepta por si algún día el backend lo
 * renombra. Leer solo `comments` dejaba la conversación siempre vacía.
 */
export function commentsOf(post: {
  comments?: DetailComment[] | null
  community_comments?: DetailComment[] | null
}): DetailComment[] {
  const list = post.comments ?? post.community_comments ?? []
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export type CreateCommentResult = { comment: DetailComment } | { error: string }

/** Publica un comentario de verdad en el backend (requiere sesión). */
export async function createComment(postId: string, content: string): Promise<CreateCommentResult> {
  const token = getToken()
  if (!token) return { error: 'Inicia sesión para comentar' }

  try {
    const res = await fetch(`${API_URL}/api/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.comment) {
      return { error: data.error || 'No pudimos publicar tu comentario' }
    }
    return { comment: data.comment as DetailComment }
  } catch {
    return { error: 'Error de conexión. Intenta de nuevo' }
  }
}

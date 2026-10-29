import { supabase } from '../supabase.service'

export type NotificationType = 'comment' | 'match' | 'skill'

export interface NotifyInput {
  userId: string
  type: NotificationType
  message: string
  /** Adonde lleva al tocarla (ruta del sitio, por ejemplo /post/<id>). */
  link: string
  meta?: Record<string, unknown>
}

/** Los avisos nunca rompen lo que los provocó: si falla (o falta la tabla) se sigue sin avisar. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await supabase.from('community_notifications').insert({ user_id: input.userId, type: input.type, message: input.message, link: input.link, meta: input.meta ?? {} })
  } catch (error) {
    console.error('[Notificaciones] No se pudo guardar el aviso:', error)
  }
}

const short = (text: string, max = 60): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** "Ana comentó tu publicación «…»" o, si ya hay varios sin leer, "3 comentarios nuevos en tu publicación «…»". */
export function commentMessage(commenter: string, title: string, count: number): string {
  return count <= 1 ? `${commenter} comentó tu publicación «${short(title)}»` : `${count} comentarios nuevos en tu publicación «${short(title)}»`
}

/**
 * Avisa al autor de una publicación que alguien la comentó. Si ya tiene un aviso sin leer de esa publicación (de las
 * últimas 24 horas) lo actualiza en vez de llenar la lista con uno por comentario. No avisa a quien comenta lo suyo.
 */
export async function notifyComment(input: { authorId: string | null; commenterId: string; commenterName: string; postId: string; postTitle: string }): Promise<void> {
  if (!input.authorId || input.authorId === input.commenterId) return
  try {
    const link = `/post/${input.postId}`
    const since = new Date(Date.now() - 24 * 3600000).toISOString()
    const { data: existing } = await supabase
      .from('community_notifications')
      .select('id, meta')
      .eq('user_id', input.authorId)
      .eq('type', 'comment')
      .eq('link', link)
      .eq('read', false)
      .gte('created_at', since)
      .limit(1)

    const found = existing?.[0] as { id: string; meta: { count?: number } } | undefined
    if (found) {
      const count = (found.meta?.count ?? 1) + 1
      await supabase.from('community_notifications').update({ message: commentMessage(input.commenterName, input.postTitle, count), meta: { count }, created_at: new Date().toISOString() }).eq('id', found.id)
      return
    }
    await notify({ userId: input.authorId, type: 'comment', message: commentMessage(input.commenterName, input.postTitle, 1), link, meta: { count: 1 } })
  } catch (error) {
    console.error('[Notificaciones] No se pudo avisar del comentario:', error)
  }
}

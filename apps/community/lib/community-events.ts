import { trackEvent } from './web-analytics'

/**
 * Eventos de la comunidad (medición, sin cambios visibles): quién participa y qué discusiones se leen. Solo se anota que pasó y el
 * identificador de la discusión; nunca el texto. La cuenta la pone el servidor de analítica desde la sesión de quien lo hace (todos
 * requieren haber iniciado sesión menos «vista»). Las cifras de participación exactas salen de las tablas (`/api/admin/analytics/community`);
 * estos eventos dejan verlas también en «web_events» y saber cuántas discusiones se leen.
 *
 * Nunca lanzan: medir no debe romper publicar, comentar ni votar.
 */
const send = (name: string, postId: string | null | undefined) => {
  try { void trackEvent(name, postId ? { post_id: postId } : {}) } catch { /* medir no debe romper la acción */ }
}

/** Una discusión creada (ya guardada en el servidor). */
export const trackDiscussionCreated = (postId: string | null | undefined) => send('discussion_created', postId)
/** Un comentario o respuesta creado (ya guardado). */
export const trackCommentCreated = (postId: string | null | undefined) => send('comment_created', postId)
/** Un voto DADO (no cuando se quita). */
export const trackVoteGiven = (postId: string | null | undefined) => send('vote_given', postId)
/** Una discusión vista (se abrió su página). */
export const trackDiscussionViewed = (postId: string | null | undefined) => send('discussion_viewed', postId)

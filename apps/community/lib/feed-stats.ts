export interface FeedStats {
  views: number
  saves: number
  applies: number
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * Las cifras de interés de una vacante para la tarjeta del feed, en una línea y solo las que aportan: un "0 guardados"
 * no dice nada y resta confianza. Las vistas cuentan desde 5; guardados, postulaciones y comentarios, desde 1.
 * Sin nada que mostrar devuelve null (la tarjeta no pinta la línea).
 */
export function compactStats(stats: FeedStats | null | undefined, comments = 0): string | null {
  if (!stats && !comments) return null
  const parts = [
    stats && stats.views >= 5 ? plural(stats.views, 'vista', 'vistas') : null,
    stats && stats.saves > 0 ? plural(stats.saves, 'guardado', 'guardados') : null,
    stats && stats.applies > 0 ? plural(stats.applies, 'postulación', 'postulaciones') : null,
    comments > 0 ? plural(comments, 'comentario', 'comentarios') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

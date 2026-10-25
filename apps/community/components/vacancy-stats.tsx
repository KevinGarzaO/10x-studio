import { Bookmark, Eye, MessageCircle, Send } from 'lucide-react'

export interface VacancyStatsData {
  views: number
  saves: number
  applies: number
}

const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/**
 * Qué tanto interesa una vacante: cuánta gente la abrió, la guardó y se postuló. Cada persona cuenta una
 * sola vez. Salen siempre las tres cifras, también en cero: un cero dice que nadie la ha visto todavía,
 * y que falte la fila no dice nada. Con `comments` suma esa cifra al final.
 */
export function VacancyStats({ stats, comments, detailed = false }: { stats?: VacancyStatsData | null; comments?: number; detailed?: boolean }) {
  const data = stats ?? { views: 0, saves: 0, applies: 0 }
  const size = detailed ? 20 : 17
  const items = [
    { key: 'views', icon: <Eye size={size} />, value: data.views, one: 'vista', many: 'vistas' },
    { key: 'saves', icon: <Bookmark size={size} />, value: data.saves, one: 'guardado', many: 'guardados' },
    { key: 'applies', icon: <Send size={size} />, value: data.applies, one: 'postulación', many: 'postulaciones' },
    // Los comentarios van en la misma fila que el resto, igual en la vacante y en el artículo.
    ...(comments === undefined ? [] : [{ key: 'comments', icon: <MessageCircle size={size} />, value: comments, one: 'comentario', many: 'comentarios' }]),
  ]

  return (
    <ul className={`vacancy-stats${detailed ? ' is-detailed' : ''}`} aria-label="Interés en la vacante">
      {items.map(item => {
        const label = item.value === 1 ? item.one : item.many
        return (
          <li key={item.key} title={`${item.value} ${label}`}>
            {item.icon}
            <b>{formatCount(item.value)}</b>
            {' '}
            <span>{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

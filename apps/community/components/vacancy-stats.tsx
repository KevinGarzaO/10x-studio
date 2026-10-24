import { Bookmark, Eye, Send } from 'lucide-react'

export interface VacancyStatsData {
  views: number
  saves: number
  applies: number
}

const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/**
 * Qué tanto interesa una vacante: cuánta gente la abrió, la guardó y se postuló. Cada persona cuenta una
 * sola vez. En la tarjeta solo salen las cifras que ya tienen algo (una fila de ceros no informa);
 * en el detalle salen siempre las tres, con su nombre completo.
 */
export function VacancyStats({ stats, detailed = false }: { stats?: VacancyStatsData | null; detailed?: boolean }) {
  if (!stats) return null
  const items = [
    { key: 'views', icon: <Eye size={14} />, value: stats.views, one: 'vista', many: 'vistas' },
    { key: 'saves', icon: <Bookmark size={14} />, value: stats.saves, one: 'guardado', many: 'guardados' },
    { key: 'applies', icon: <Send size={14} />, value: stats.applies, one: 'postulación', many: 'postulaciones' },
  ].filter(item => detailed || item.value > 0)
  if (items.length === 0) return null

  return (
    <ul className={`vacancy-stats${detailed ? ' is-detailed' : ''}`} aria-label="Interés en la vacante">
      {items.map(item => {
        const label = item.value === 1 ? item.one : item.many
        return (
          <li key={item.key} title={`${item.value} ${label}`}>
            {item.icon}
            <b>{formatCount(item.value)}</b>
            {detailed && <span>{label}</span>}
          </li>
        )
      })}
    </ul>
  )
}

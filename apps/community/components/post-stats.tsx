import { ArrowBigUp, Clock, MessageCircle } from 'lucide-react'

const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/**
 * Las cifras de un artículo o una discusión, en la misma fila y con el mismo aspecto que las de una vacante
 * (`VacancyStats`): votos (que se pueden dar desde aquí), comentarios y minutos de lectura.
 */
export function PostStats({
  votes,
  voted,
  onVote,
  comments,
  readMinutes,
  detailed = false,
}: {
  votes: number
  voted: boolean
  onVote: () => void
  comments: number
  readMinutes?: number | null
  detailed?: boolean
}) {
  const size = detailed ? 20 : 17
  return (
    <ul className={`vacancy-stats${detailed ? ' is-detailed' : ''}`} aria-label="Interés en la publicación">
      <li>
        <button type="button" className={`vote-button ${voted ? 'voted' : ''}`} onClick={onVote} aria-label={voted ? 'Quitar voto' : 'Votar'} aria-pressed={voted}>
          <ArrowBigUp size={size} fill={voted ? 'currentColor' : 'none'} />
          <b>{formatCount(votes)}</b>
          {' '}
          <span>{votes === 1 ? 'voto' : 'votos'}</span>
        </button>
      </li>
      <li title={`${comments} comentarios`}>
        <MessageCircle size={size} />
        <b>{formatCount(comments)}</b>
        {' '}
        <span>{comments === 1 ? 'comentario' : 'comentarios'}</span>
      </li>
      {readMinutes ? (
        <li title="Tiempo de lectura">
          <Clock size={size} />
          <b>{readMinutes}</b>
          {' '}
          <span>min de lectura</span>
        </li>
      ) : null}
    </ul>
  )
}

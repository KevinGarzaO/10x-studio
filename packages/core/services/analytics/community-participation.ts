import { supabase } from '../supabase.service'
import { readAll } from './read'
import { dayKey } from './metrics'

/**
 * ¿La comunidad da motivos para volver? Cuatro lecturas por semana (lunes a domingo, hora de Monterrey), calculadas de las tablas reales
 * (publicaciones, comentarios, votos y la actividad diaria de las cuentas), sin nombres ni correos:
 *   1. Personas que participan (crean una discusión, un comentario o un voto) sobre las cuentas activas de la semana.
 *   2. Discusiones que nadie contestó en sus primeras 24 horas.
 *   3. De las cuentas activas de la semana, qué parte volvió a estar activa la semana siguiente: quien participó contra quien no.
 * Cuenta personas, no clics. Con pocas personas (menos de 3 en un grupo) no se calcula el porcentaje: se lee el conteo.
 * Las reglas son puras para poder probarlas; `loadCommunityParticipation` solo lee las tablas.
 */
const DAY_MS = 86_400_000
const REPLY_WINDOW_MS = 24 * 3_600_000
export const MIN_GROUP = 3

export interface PostRow { id: string; author_id: string | null; created_at: string }
export interface CommentRow { author_id: string | null; post_id: string; created_at: string }
export interface VoteRow { user_id: string | null; created_at: string }
export interface ActivityRow { user_id: string; day: string }

export interface ReturnGroup { active: number; returned: number; returnedPct: number | null }
export interface CommunityWeek {
  weekStart: string
  weekEnd: string
  partial: boolean
  activeAccounts: number
  participants: number
  participantsPct: number | null
  discussions: number
  comments: number
  votes: number
  /** Discusiones con 24 horas ya cumplidas que nadie más contestó en ese plazo. */
  unansweredAfter24h: number
  /** De las discusiones con las 24 horas ya cumplidas. */
  discussionsOldEnough: number
  /** Lo que publicó el EQUIPO (cuentas del equipo y de prueba), aparte: nunca entra en las cifras de arriba, que son solo de la comunidad. */
  team: { discussions: number; comments: number; votes: number }
  /** Regreso en la semana siguiente. null si esa semana aún no termina. */
  nextWeek: { participants: ReturnGroup; others: ReturnGroup } | null
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const group = (active: number, returned: number): ReturnGroup => ({ active, returned, returnedPct: active >= MIN_GROUP ? share(returned, active) : null })

export function buildCommunityParticipation(
  input: { posts: PostRow[]; comments: CommentRow[]; votes: VoteRow[]; activity: ActivityRow[]; realIds: Set<string>; teamIds?: Set<string> },
  weeks: number,
  now: Date = new Date(),
): CommunityWeek[] {
  const key = (date: Date) => date.toISOString().slice(0, 10)
  const today = new Date(`${dayKey(now.toISOString())}T00:00:00Z`)
  const sinceMonday = (today.getUTCDay() + 6) % 7
  const currentMonday = new Date(today.getTime() - sinceMonday * DAY_MS)
  const weekOf = (day: string): string => {
    const date = new Date(`${day}T00:00:00Z`)
    return key(new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS))
  }
  const isReal = (id: string | null): id is string => !!id && input.realIds.has(id)

  const activeBy = new Map<string, Set<string>>()
  for (const row of input.activity) {
    if (!input.realIds.has(row.user_id)) continue
    const week = weekOf(row.day)
    if (!activeBy.has(week)) activeBy.set(week, new Set())
    activeBy.get(week)!.add(row.user_id)
  }

  const partBy = new Map<string, Set<string>>()
  const counts = new Map<string, { discussions: number; comments: number; votes: number }>()
  const bump = (week: string, person: string, what: 'discussions' | 'comments' | 'votes') => {
    if (!partBy.has(week)) partBy.set(week, new Set())
    partBy.get(week)!.add(person)
    const entry = counts.get(week) ?? { discussions: 0, comments: 0, votes: 0 }
    entry[what]++
    counts.set(week, entry)
  }
  for (const post of input.posts) if (isReal(post.author_id)) bump(weekOf(dayKey(post.created_at)), post.author_id, 'discussions')
  for (const comment of input.comments) if (isReal(comment.author_id)) bump(weekOf(dayKey(comment.created_at)), comment.author_id, 'comments')
  for (const vote of input.votes) if (isReal(vote.user_id)) bump(weekOf(dayKey(vote.created_at)), vote.user_id, 'votes')

  // Las discusiones sin respuesta de otra persona en sus primeras 24 horas (solo las que ya cumplieron las 24 horas).
  const commentsByPost = new Map<string, CommentRow[]>()
  for (const comment of input.comments) {
    if (!commentsByPost.has(comment.post_id)) commentsByPost.set(comment.post_id, [])
    commentsByPost.get(comment.post_id)!.push(comment)
  }
  const unanswered = new Map<string, { old: number; none: number }>()
  for (const post of input.posts) {
    if (!isReal(post.author_id)) continue
    const created = Date.parse(post.created_at)
    if (now.getTime() - created < REPLY_WINDOW_MS) continue
    const answered = (commentsByPost.get(post.id) ?? []).some((comment) => comment.author_id !== post.author_id && Date.parse(comment.created_at) - created <= REPLY_WINDOW_MS)
    const week = weekOf(dayKey(post.created_at))
    const entry = unanswered.get(week) ?? { old: 0, none: 0 }
    entry.old++
    if (!answered) entry.none++
    unanswered.set(week, entry)
  }

  // Lo del equipo, aparte (mismas semanas): para ver cuánto se siembra sin que infle la participación de la comunidad.
  const teamBy = new Map<string, { discussions: number; comments: number; votes: number }>()
  const teamBump = (week: string, what: 'discussions' | 'comments' | 'votes') => {
    const entry = teamBy.get(week) ?? { discussions: 0, comments: 0, votes: 0 }
    entry[what]++
    teamBy.set(week, entry)
  }
  const isTeam = (id: string | null) => !!id && !!input.teamIds?.has(id)
  for (const post of input.posts) if (isTeam(post.author_id)) teamBump(weekOf(dayKey(post.created_at)), 'discussions')
  for (const comment of input.comments) if (isTeam(comment.author_id)) teamBump(weekOf(dayKey(comment.created_at)), 'comments')
  for (const vote of input.votes) if (isTeam(vote.user_id)) teamBump(weekOf(dayKey(vote.created_at)), 'votes')

  const rows: CommunityWeek[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday.getTime() - i * 7 * DAY_MS)
    const week = key(monday)
    const nextWeek = key(new Date(monday.getTime() + 7 * DAY_MS))
    const active = activeBy.get(week) ?? new Set<string>()
    const participants = partBy.get(week) ?? new Set<string>()
    const next = activeBy.get(nextWeek) ?? new Set<string>()
    // La semana siguiente ya terminó solo si esta es de hace dos o más semanas (la anterior a la de ahora tiene como «siguiente» la semana en curso).
    const nextDone = i >= 2
    const part = [...active].filter((id) => participants.has(id))
    const rest = [...active].filter((id) => !participants.has(id))
    const count = counts.get(week) ?? { discussions: 0, comments: 0, votes: 0 }
    const old = unanswered.get(week) ?? { old: 0, none: 0 }
    rows.push({
      weekStart: week,
      weekEnd: key(new Date(monday.getTime() + 6 * DAY_MS)),
      partial: i === 0 && sinceMonday < 6,
      activeAccounts: active.size,
      participants: participants.size,
      participantsPct: active.size >= MIN_GROUP ? share(participants.size, active.size) : null,
      ...count,
      unansweredAfter24h: old.none,
      discussionsOldEnough: old.old,
      team: teamBy.get(week) ?? { discussions: 0, comments: 0, votes: 0 },
      nextWeek: nextDone
        ? { participants: group(part.length, part.filter((id) => next.has(id)).length), others: group(rest.length, rest.filter((id) => next.has(id)).length) }
        : null,
    })
  }
  return rows
}

export interface CommunityParticipation {
  weeks: CommunityWeek[]
  /** false = la tabla de votos aún no guarda la fecha (falta community-votes-created-at-migration.sql): los votos no se cuentan por semana. */
  votesDated: boolean
  notes: string[]
}

export async function loadCommunityParticipation(weeks: number, now: Date = new Date()): Promise<CommunityParticipation> {
  const since = new Date(now.getTime() - (weeks + 2) * 7 * DAY_MS).toISOString()
  // La tabla de votos no guardaba la fecha hasta community-votes-created-at-migration.sql: sin ella, los votos no se pueden poner en una semana
  // y se dejan fuera (con un aviso), en vez de romper toda la lectura.
  const readVotes = async (): Promise<VoteRow[] | null> => {
    try {
      return await readAll<VoteRow>((from, to) => supabase.from('community_votes').select('user_id, created_at').gte('created_at', since).range(from, to))
    } catch {
      return null
    }
  }
  const [users, teamUsers, posts, comments, votesRead, activity] = await Promise.all([
    readAll<{ id: string }>((from, to) => supabase.from('users').select('id').eq('user_kind', 'user').eq('is_test_account', false).not('is_scraper_profile', 'is', true).range(from, to)),
    // El equipo: cuentas de superadmin y cuentas de prueba (las del scraper no son el equipo ni la comunidad).
    readAll<{ id: string }>((from, to) => supabase.from('users').select('id').or('user_kind.eq.superadmin,is_test_account.eq.true').not('is_scraper_profile', 'is', true).range(from, to)),
    readAll<PostRow>((from, to) => supabase.from('community_posts').select('id, author_id, created_at').eq('type', 'discussion').gte('created_at', since).range(from, to)),
    readAll<CommentRow>((from, to) => supabase.from('community_comments').select('author_id, post_id, created_at').gte('created_at', since).range(from, to)),
    readVotes(),
    readAll<ActivityRow>((from, to) => supabase.from('user_activity_daily').select('user_id, day').gte('day', since.slice(0, 10)).range(from, to)),
  ])
  const votes = votesRead ?? []
  return {
    votesDated: votesRead !== null,
    weeks: buildCommunityParticipation({ posts, comments, votes, activity, realIds: new Set(users.map((user) => user.id)), teamIds: new Set(teamUsers.map((user) => user.id)) }, weeks, now),
    notes: [
      ...(votesRead === null ? ['Los votos todavía no se cuentan por semana: falta correr community-votes-created-at-migration.sql (la tabla no guardaba la fecha de cada voto). Discusiones y comentarios sí se cuentan.'] : []),
      'Las cifras de participación son SOLO de la comunidad: cuentas reales, sin el equipo, sin cuentas de prueba y sin perfiles del scraper. Lo que publica el equipo (cuentas del equipo y de prueba) se ve aparte en «team» y nunca infla la participación.',
      'Cuenta cuentas reales (sin equipo, pruebas ni perfiles del scraper). Semana de lunes a domingo en hora de Monterrey; la semana en curso es parcial.',
      'Participar = crear una discusión, un comentario o un voto. «Cuentas activas» sale de la actividad diaria de las cuentas.',
      '«Sin respuesta tras 24 horas» solo cuenta discusiones que ya cumplieron 24 horas y que nadie más contestó en ese plazo.',
      'El regreso compara a quien participó con quien no, pero quien participa ya puede ser quien más volvía: no prueba que participar cause el regreso. Con menos de 3 personas en un grupo no se calcula el porcentaje.',
    ],
  }
}

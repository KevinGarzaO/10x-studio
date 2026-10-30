import { scoreMatch, type MatchCandidate, type ValidationLevel } from '../matching/score'

/**
 * Cómo está funcionando el match: qué tan bien encajan las vacantes con la gente que hay.
 *
 * Usa EL MISMO motor que "Para ti" (services/matching/score.ts), así que lo que dice el panel es
 * lo que de verdad ve cada persona: un match "cuenta" cuando `scoreMatch` dice que califica
 * (comparten al menos un skill y llega al puntaje mínimo).
 *
 * Es una función pura sobre listas: no toca la base y se prueba con datos de ejemplo.
 */

export interface PanelCandidate extends MatchCandidate {
  id: string
  name: string
  photo: string | null
  /** Nombre del puesto elegido; sin él no se puede puntuar. */
  validatedSkills: Record<string, ValidationLevel>
}

export interface PanelVacancy {
  slug: string
  title: string
  company: string | null
  roleCategory: string | null
  seniority: string | null
  skills: string[]
  workModality: string | null
}

export interface CandidateMatching {
  id: string
  name: string
  photo: string | null
  role: string | null
  seniority: string | null
  skills: number
  validatedSkills: number
  /** Vacantes que califican para esta persona (las que le aparecen en "Para ti"). */
  matches: number
  /** De esas, las buenas: GOOD_SCORE o más. Es lo que dice si de verdad hay ofertas para esta persona. */
  goodMatches: number
  /** El mejor puntaje (0 a 100) que alcanza con alguna vacante; null si ninguna califica. */
  bestScore: number | null
  /** El puntaje promedio de sus 5 mejores vacantes. */
  topAverage: number | null
  state: 'sin_ofertas' | 'pocas_ofertas' | 'ok'
}

export interface Bucket {
  label: string
  count: number
}

export interface MatchingOverview {
  candidates: number
  vacancies: number
  skillsPerCandidate: { average: number | null; median: number | null; withNone: number; buckets: Bucket[] }
  coverage: {
    withMatch: number
    withMatchPct: number | null
    /** Personas con al menos una vacante buena. */
    withGoodMatch: number
    withGoodMatchPct: number | null
    /** Personas con FEW_OFFERS o más vacantes buenas: las que abren "Para ti" y encuentran de dónde elegir. */
    withEnoughGood: number
    averageMatches: number | null
    medianMatches: number | null
    averageGoodMatches: number | null
    medianGoodMatches: number | null
  }
  bestScores: { average: number | null; buckets: Bucket[] }
  vacancyCoverage: { withCandidates: number; withCandidatesPct: number | null; withNone: number }
  topVacancies: { slug: string; title: string; company: string | null; candidates: number; bestScore: number }[]
  byRole: { role: string; candidates: number; vacancies: number; averageMatches: number | null }[]
  skills: {
    declared: { skill: string; candidates: number; vacancies: number }[]
    demandedWithoutSupply: { skill: string; vacancies: number }[]
    declaredWithoutDemand: { skill: string; candidates: number }[]
  }
  people: CandidateMatching[]
}

/** Menos de esto es "pocas ofertas": la persona abre "Para ti" y casi no hay nada bueno. */
export const FEW_OFFERS = 5

/** Desde qué puntaje una vacante es una oferta buena y no solo "califica" (el mínimo para aparecer es menor). */
export const GOOD_SCORE = 70

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
}
const average = (values: number[]): number | null => (values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10)
const share = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

const SCORE_BUCKETS: [string, number, number][] = [
  ['Sin match', -1, -1],
  ['42–59%', 0, 59],
  ['60–69%', 60, 69],
  ['70–79%', 70, 79],
  ['80–89%', 80, 89],
  ['90–100%', 90, 100],
]

export function buildMatchingOverview(input: { candidates: PanelCandidate[]; vacancies: PanelVacancy[] }): MatchingOverview {
  const { candidates, vacancies } = input

  // Cada persona contra cada vacante, con el motor real.
  const perVacancy = new Map<string, { candidates: number; best: number }>()
  const people: CandidateMatching[] = candidates.map((person) => {
    const scores: number[] = []
    for (const vacancy of vacancies) {
      const result = scoreMatch(person, {
        roleCategory: vacancy.roleCategory,
        seniority: vacancy.seniority,
        skills: vacancy.skills.map((skill) => skill.toLowerCase()),
        workModality: vacancy.workModality,
      })
      // La misma regla que la publicación (services/vacancies/serves-someone.ts): encaja y comparte al menos un skill.
      if (!result.qualifies || result.sharedSkills.length === 0) continue
      scores.push(result.score)
      const entry = perVacancy.get(vacancy.slug) ?? { candidates: 0, best: 0 }
      perVacancy.set(vacancy.slug, { candidates: entry.candidates + 1, best: Math.max(entry.best, result.score) })
    }

    scores.sort((a, b) => b - a)
    return {
      id: person.id,
      name: person.name,
      photo: person.photo,
      role: person.roleCategory,
      seniority: person.seniority,
      skills: person.skills.length,
      validatedSkills: Object.keys(person.validatedSkills).length,
      matches: scores.length,
      goodMatches: scores.filter((score) => score >= GOOD_SCORE).length,
      bestScore: scores[0] ?? null,
      topAverage: average(scores.slice(0, 5)),
      state: scores.length === 0 ? 'sin_ofertas' : scores.filter((score) => score >= GOOD_SCORE).length < FEW_OFFERS ? 'pocas_ofertas' : 'ok',
    }
  })
  people.sort((a, b) => a.goodMatches - b.goodMatches || a.matches - b.matches || a.name.localeCompare(b.name))

  const matchCounts = people.map((person) => person.matches)
  const goodCounts = people.map((person) => person.goodMatches)
  const skillCounts = people.map((person) => person.skills)
  const withMatch = people.filter((person) => person.matches > 0)

  // Cuántos skills declara la gente.
  const skillBuckets: Bucket[] = [
    { label: 'Ninguno', count: skillCounts.filter((n) => n === 0).length },
    { label: '1–2', count: skillCounts.filter((n) => n >= 1 && n <= 2).length },
    { label: '3–5', count: skillCounts.filter((n) => n >= 3 && n <= 5).length },
    { label: '6–9', count: skillCounts.filter((n) => n >= 6 && n <= 9).length },
    { label: '10 o más', count: skillCounts.filter((n) => n >= 10).length },
  ]

  // Mejor puntaje por persona.
  const bestScores = people.map((person) => person.bestScore)
  const scoreBuckets: Bucket[] = SCORE_BUCKETS.map(([label, from, to]) => ({
    label,
    count: bestScores.filter((score) => (from === -1 ? score === null : score !== null && score >= from && score <= to)).length,
  }))

  // Del lado de las vacantes.
  const matchedSlugs = new Set(perVacancy.keys())
  const topVacancies = vacancies
    .filter((vacancy) => matchedSlugs.has(vacancy.slug))
    .map((vacancy) => ({ slug: vacancy.slug, title: vacancy.title, company: vacancy.company, candidates: perVacancy.get(vacancy.slug)!.candidates, bestScore: perVacancy.get(vacancy.slug)!.best }))
    .sort((a, b) => b.candidates - a.candidates || b.bestScore - a.bestScore)
    .slice(0, 10)

  // Por rol.
  const roles = new Set([...candidates.map((p) => p.roleCategory), ...vacancies.map((v) => v.roleCategory)].filter((r): r is string => !!r))
  const byRole = [...roles]
    .map((role) => {
      const inRole = people.filter((person) => person.role === role)
      return {
        role,
        candidates: inRole.length,
        vacancies: vacancies.filter((vacancy) => vacancy.roleCategory === role).length,
        averageMatches: average(inRole.map((person) => person.matches)),
      }
    })
    .sort((a, b) => b.candidates - a.candidates || b.vacancies - a.vacancies)

  // Skills: lo que la gente declara frente a lo que las vacantes piden.
  const declared = new Map<string, number>()
  for (const person of candidates) for (const skill of new Set(person.skills.map((s) => s.toLowerCase()))) declared.set(skill, (declared.get(skill) ?? 0) + 1)
  const demanded = new Map<string, number>()
  for (const vacancy of vacancies) for (const skill of new Set(vacancy.skills.map((s) => s.toLowerCase()))) demanded.set(skill, (demanded.get(skill) ?? 0) + 1)

  return {
    candidates: candidates.length,
    vacancies: vacancies.length,
    skillsPerCandidate: { average: average(skillCounts), median: median(skillCounts), withNone: skillBuckets[0].count, buckets: skillBuckets },
    coverage: {
      withMatch: withMatch.length,
      withMatchPct: share(withMatch.length, candidates.length),
      withGoodMatch: people.filter((person) => person.goodMatches > 0).length,
      withGoodMatchPct: share(people.filter((person) => person.goodMatches > 0).length, candidates.length),
      withEnoughGood: people.filter((person) => person.goodMatches >= FEW_OFFERS).length,
      averageMatches: average(matchCounts),
      medianMatches: median(matchCounts),
      averageGoodMatches: average(goodCounts),
      medianGoodMatches: median(goodCounts),
    },
    bestScores: { average: average(withMatch.map((person) => person.bestScore!)), buckets: scoreBuckets },
    vacancyCoverage: {
      withCandidates: matchedSlugs.size,
      withCandidatesPct: share(matchedSlugs.size, vacancies.length),
      withNone: vacancies.length - matchedSlugs.size,
    },
    topVacancies,
    byRole,
    skills: {
      declared: [...declared.entries()]
        .map(([skill, count]) => ({ skill, candidates: count, vacancies: demanded.get(skill) ?? 0 }))
        .sort((a, b) => b.candidates - a.candidates || a.skill.localeCompare(b.skill))
        .slice(0, 12),
      demandedWithoutSupply: [...demanded.entries()]
        .filter(([skill]) => !declared.has(skill))
        .map(([skill, count]) => ({ skill, vacancies: count }))
        .sort((a, b) => b.vacancies - a.vacancies)
        .slice(0, 10),
      declaredWithoutDemand: [...declared.entries()]
        .filter(([skill]) => !demanded.has(skill))
        .map(([skill, count]) => ({ skill, candidates: count }))
        .sort((a, b) => b.candidates - a.candidates),
    },
    people,
  }
}

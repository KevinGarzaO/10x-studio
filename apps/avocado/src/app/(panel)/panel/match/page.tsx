'use client'

import { DataTable } from '@/components/panel/DataTable'
import { Avatar, Card, Empty, ErrorBox, fmtNum, fmtPct, InlineBar, Loading, PageHeader, roleLabel, Stat, usePanelData } from '@/components/panel/ui'

interface Bucket { label: string; count: number }
interface Matching {
  candidates: number
  vacancies: number
  withoutRole: number
  skillsPerCandidate: { average: number | null; median: number | null; withNone: number; buckets: Bucket[] }
  coverage: {
    withMatch: number; withMatchPct: number | null; withGoodMatch: number; withGoodMatchPct: number | null; withEnoughGood: number
    averageMatches: number | null; medianMatches: number | null; averageGoodMatches: number | null; medianGoodMatches: number | null
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
  people: {
    id: string; name: string; photo: string | null; role: string | null; seniority: string | null; skills: number; validatedSkills: number
    matches: number; goodMatches: number; bestScore: number | null; topAverage: number | null; state: 'sin_ofertas' | 'pocas_ofertas' | 'ok'
  }[]
}

const LEVEL: Record<string, string> = { junior: 'Junior', semi_senior: 'Semi Senior', senior: 'Senior' }
const STATE: Record<string, { label: string; tone: string }> = {
  sin_ofertas: { label: 'Sin ofertas', tone: 'bad' },
  pocas_ofertas: { label: 'Pocas ofertas', tone: 'warn' },
  ok: { label: 'Bien', tone: 'good' },
}

function Distribution({ title, hint, buckets, color }: { title: string; hint?: string; buckets: Bucket[]; color?: string }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const max = Math.max(1, ...buckets.map(bucket => bucket.count))
  return (
    <Card title={title} hint={hint}>
      {buckets.map(bucket => (
        <div key={bucket.label} className="panel-funnel-row" style={{ gridTemplateColumns: '110px minmax(0, 1fr) 90px', padding: '6px 0' }}>
          <span>{bucket.label}</span>
          <InlineBar value={bucket.count} max={max} color={color} />
          <span style={{ textAlign: 'right' }}><b>{bucket.count}</b> <span className="panel-muted">· {fmtPct(total > 0 ? Math.round((bucket.count / total) * 1000) / 10 : null)}</span></span>
        </div>
      ))}
    </Card>
  )
}

export default function MatchPage() {
  const { data, loading, error, reload } = usePanelData<Matching>('/api/admin/analytics/matching')
  const needAttention = data ? data.people.filter(person => person.state !== 'ok').length : 0

  return (
    <>
      <PageHeader title="Match" subtitle="Qué tan bien encajan las vacantes abiertas con la gente que hay. Usa el mismo cálculo que ve cada persona en “Para ti”." />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="panel-grid cols-4">
            <Stat label="Personas con match" value={fmtNum(data.candidates)} tone={data.withoutRole > 0 ? 'warn' : undefined} caption={data.withoutRole > 0 ? `${data.withoutRole} más no han elegido su puesto y no ven “Para ti”.` : 'Todas las personas con cuenta ya eligieron su puesto.'} />
            <Stat label="Con ofertas buenas" value={fmtPct(data.coverage.withGoodMatchPct)} tone={needAttention > 0 ? 'warn' : 'good'} caption={`${data.coverage.withGoodMatch} de ${data.candidates} tienen al menos una vacante de 70% o más.`} />
            <Stat label="Ofertas buenas por persona" value={fmtNum(data.coverage.averageGoodMatches)} caption={`Promedio de vacantes de 70% o más. La mitad tiene ${fmtNum(data.coverage.medianGoodMatches)} o menos.`} />
            <Stat label="Mejor match promedio" value={fmtPct(data.bestScores.average)} caption="El porcentaje de la mejor vacante de cada persona, promediado." />
          </div>

          <div className="panel-grid cols-2">
            <Distribution title="Mejor match de cada persona" hint="Su vacante con más porcentaje" buckets={data.bestScores.buckets} />
            <Distribution title="Skills que declara cada persona" hint={`Promedio ${fmtNum(data.skillsPerCandidate.average)} · mediana ${fmtNum(data.skillsPerCandidate.median)}`} buckets={data.skillsPerCandidate.buckets} color="#6366f1" />
          </div>

          <Card title="Persona por persona" hint={needAttention > 0 ? `${needAttention} con pocas ofertas buenas, primero` : 'Las de menos ofertas buenas, primero'}>
            {data.people.length === 0 ? <Empty>Aún no hay personas con puesto elegido.</Empty> : (
              <DataTable
                rows={data.people}
                rowKey={person => person.id}
                searchText={person => `${person.name} ${roleLabel(person.role)}`}
                searchLabel="Buscar persona o puesto"
                filter={{ label: 'Estado', options: Object.entries(STATE).map(([value, state]) => ({ value, label: state.label })), test: (person, value) => person.state === value }}
                head={<tr><th>Persona</th><th>Puesto</th><th>Nivel</th><th className="num">Skills</th><th className="num">Validados</th><th className="num">Califican</th><th className="num">Buenas (70%+)</th><th className="num">Mejor</th><th>Estado</th></tr>}
                renderRow={person => (
                  <tr>
                    <td><div className="panel-person"><Avatar name={person.name} photo={person.photo} /><b>{person.name}</b></div></td>
                    <td>{roleLabel(person.role)}</td>
                    <td>{LEVEL[person.seniority ?? ''] ?? '—'}</td>
                    <td className="num">{person.skills}</td>
                    <td className="num">{person.validatedSkills || '—'}</td>
                    <td className="num">{fmtNum(person.matches)}</td>
                    <td className="num"><b>{fmtNum(person.goodMatches)}</b></td>
                    <td className="num">{person.bestScore === null ? '—' : `${person.bestScore}%`}</td>
                    <td><span className={`panel-chip ${STATE[person.state].tone}`}>{STATE[person.state].label}</span></td>
                  </tr>
                )}
              />
            )}
          </Card>

          <div className="panel-grid cols-2">
            <Card title="Por puesto" hint="Gente contra vacantes abiertas">
              <DataTable
                rows={data.byRole}
                rowKey={row => row.role}
                searchText={row => roleLabel(row.role)}
                searchLabel="Buscar puesto"
                head={<tr><th>Puesto</th><th className="num">Personas</th><th className="num">Vacantes</th><th className="num">Califican por persona</th></tr>}
                renderRow={row => (
                  <tr>
                    <td>{roleLabel(row.role)}</td>
                    <td className="num">{row.candidates}</td>
                    <td className="num">{row.vacancies}</td>
                    <td className="num">{row.averageMatches === null ? '—' : fmtNum(row.averageMatches)}</td>
                  </tr>
                )}
              />
            </Card>

            <Card title="Las vacantes" hint="Del otro lado: ¿a alguien le sirven?">
              <div className="panel-grid cols-2" style={{ marginBottom: 12 }}>
                <Stat label="Le sirven a alguien" value={fmtPct(data.vacancyCoverage.withCandidatesPct)} caption={`${fmtNum(data.vacancyCoverage.withCandidates)} de ${fmtNum(data.vacancies)} vacantes abiertas.`} />
                <Stat label="No le sirven a nadie" value={fmtNum(data.vacancyCoverage.withNone)} tone={data.vacancyCoverage.withNone > 0 ? 'warn' : undefined} caption="Hoy no hay una persona a quien recomendárselas." />
              </div>
              {data.topVacancies.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, fontSize: 13 }}>
                  {data.topVacancies.slice(0, 5).map(vacancy => (
                    <li key={vacancy.slug} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{vacancy.title} <span className="panel-muted">· {vacancy.company}</span></span>
                      <b>{vacancy.candidates} personas</b>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="panel-grid cols-3">
            <Card title="Lo que declara la gente" hint="Skills más comunes y cuántas vacantes los piden">
              <DataTable
                rows={data.skills.declared}
                rowKey={row => row.skill}
                searchText={row => row.skill}
                searchLabel="Buscar skill"
                head={<tr><th>Skill</th><th className="num">Personas</th><th className="num">Vacantes</th></tr>}
                renderRow={row => <tr><td>{row.skill}</td><td className="num">{row.candidates}</td><td className="num">{row.vacancies}</td></tr>}
              />
            </Card>
            <Card title="Se piden y nadie tiene" hint="Skills de las vacantes sin una sola persona">
              {data.skills.demandedWithoutSupply.length === 0 ? <Empty>No hay.</Empty> : (
                <DataTable
                  rows={data.skills.demandedWithoutSupply}
                  rowKey={row => row.skill}
                  searchText={row => row.skill}
                  searchLabel="Buscar skill"
                  head={<tr><th>Skill</th><th className="num">Vacantes</th></tr>}
                  renderRow={row => <tr><td>{row.skill}</td><td className="num">{row.vacancies}</td></tr>}
                />
              )}
            </Card>
            <Card title="Los tienen y nadie los pide" hint="Skills de la gente que ninguna vacante abierta menciona">
              {data.skills.declaredWithoutDemand.length === 0 ? <Empty>No hay.</Empty> : (
                <DataTable
                  rows={data.skills.declaredWithoutDemand}
                  rowKey={row => row.skill}
                  searchText={row => row.skill}
                  searchLabel="Buscar skill"
                  head={<tr><th>Skill</th><th className="num">Personas</th></tr>}
                  renderRow={row => <tr><td>{row.skill}</td><td className="num">{row.candidates}</td></tr>}
                />
              )}
            </Card>
          </div>

          <p className="panel-defs">
            <b>Cómo leerlo.</b> Una vacante <b>califica</b> cuando comparte al menos un skill con la persona y llega al puntaje mínimo (42%): es la que le aparece en
            “Para ti”. Una oferta <b>buena</b> es una de 70% o más: el puesto, el nivel, los skills y la modalidad encajan de verdad. El porcentaje suma puesto (35),
            skills (28), skills validados con examen (7), nivel (15) y modalidad (15). Solo se cuentan las vacantes abiertas (últimos 45 días) y las personas reales.
            Con pocas personas, un perfil con muchos skills mueve mucho el promedio: mira la tabla persona por persona.
          </p>
        </>
      )}
    </>
  )
}

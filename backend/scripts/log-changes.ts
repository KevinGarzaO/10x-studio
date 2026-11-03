import 'dotenv/config'
import { execFileSync } from 'child_process'
import { parseCommitSubject, parseExpectedMetric, recordChange } from '../services/analytics/changes'

/**
 * Trae de git a la bitácora de cambios lo que se subió (solo feat / fix / perf, con la hora del commit).
 *   npm run log-changes                      muestra lo que anotaría (no guarda nada)
 *   npm run log-changes -- --apply           lo guarda (un commit que ya estaba no se duplica)
 *   npm run log-changes -- --since 2026-10-01  desde qué fecha mirar (por defecto, 30 días)
 *
 * La hora del commit no es la hora del despliegue; las que salen después del primer arranque en Railway se corrigen solas
 * (recordDeployFromEnv), las de antes se quedan con la hora del commit.
 */
async function main() {
  const apply = process.argv.includes('--apply')
  const sinceIndex = process.argv.indexOf('--since')
  const since = sinceIndex > -1 ? process.argv[sinceIndex + 1] : new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? '')) throw new Error('--since pide una fecha AAAA-MM-DD')

  const raw = execFileSync('git', ['log', `--since=${since}`, '--no-merges', '--format=%H%x1f%cI%x1f%s%x1f%b%x1e'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  const commits = raw.split('\x1e').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [sha, date, subject, body] = entry.split('\x1f')
    return { sha, date, subject, parsed: parseCommitSubject(subject), expectedMetric: parseExpectedMetric(`${subject}\n${body ?? ''}`) }
  })
  const counted = commits.filter((commit) => commit.parsed)
  console.log(`${commits.length} commits desde ${since}; ${counted.length} son cambios que se miden (feat / fix / perf).`)

  let saved = 0
  for (const commit of counted.reverse()) {
    const { kind, area, title } = commit.parsed!
    if (!apply) {
      console.log(`${commit.date.slice(0, 16)}  ${kind.padEnd(7)} ${area.padEnd(14)} ${title}`)
      continue
    }
    const result = await recordChange({ title, kind, area, expectedMetric: commit.expectedMetric, commitSha: commit.sha, source: 'git', shippedAt: new Date(commit.date) })
    if (!result.saved && result.reason) { console.error(result.reason); process.exit(1) }
    saved += 1
  }
  console.log(apply ? `Listo: ${saved} revisados (los que ya estaban no se duplicaron).` : 'Nada guardado. Usa -- --apply para guardar.')
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

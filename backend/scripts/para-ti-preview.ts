/**
 * Te manda de prueba los dos correos de "Para ti" con TUS vacantes reales: el resumen semanal y la alerta de
 * coincidencia fuerte. Calcula la compatibilidad con el mismo cálculo de la app. No toca ninguna lista.
 *
 *   RESEND_API_KEY=re_... npm run para-ti-preview -- tu@correo.com [--user usuario] [--window 30]
 *
 * --user: de quién es el perfil que se usa (por defecto kgarzaortiz, el tuyo). --window: cuántos días hacia atrás
 * se miran las vacantes (por defecto 30 en la prueba, para que haya con qué armar el correo; el real usa 7).
 */
import 'dotenv/config'
import { Resend } from 'resend'
import { sendTracked } from '../services/email/budget'
import { supabase } from '../services/supabase.service'
import { trackedLink } from '../services/email/links'
import { DEFAULT_FROM, DEFAULT_REPLY_TO, firstName } from '../services/email/profile-reminder'
import { ALERT_MIN_SCORE, DIGEST_MIN_SCORE, metaOf, rankMatches, type MatchableVacancy, type RankedMatch } from '../services/email/para-ti'
import { renderAlert, renderDigest, type MatchItem } from '../services/email/templates/para-ti'

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const to = process.argv[2]
  if (!process.env.RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY en el entorno')
  if (!to || to.startsWith('--')) throw new Error('Uso: npm run para-ti-preview -- tu@correo.com [--user usuario] [--window 30]')

  const username = arg('--user') ?? 'kgarzaortiz'
  const windowDays = Number(arg('--window') ?? 30)

  const { data: user } = await supabase.from('users').select('username, display_name, name, role_category, seniority, skills, work_modality').eq('username', username).single()
  if (!user?.role_category) throw new Error(`El usuario ${username} no tiene perfil completo`)
  const candidate = { roleCategory: user.role_category as string, seniority: user.seniority as string | null, skills: (user.skills ?? []) as string[], workModality: user.work_modality as string | null }

  const { data: labels } = await supabase.from('skills').select('name, label')
  const labelOf = new Map((labels ?? []).map(row => [String(row.name).toLowerCase(), String(row.label)]))
  const pretty = (skills: string[]) => skills.map(skill => labelOf.get(skill) ?? skill)

  const { data: rows } = await supabase
    .from('community_posts')
    .select('id, slug, title, company, modalidad, seniority_level, role_category, skills, created_at')
    .eq('type', 'job')
    .not('slug', 'is', null)
    .gte('created_at', new Date(Date.now() - windowDays * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(600)
  const vacancies = ((rows ?? []) as (Omit<MatchableVacancy, 'skills'> & { skills: unknown })[]).map(row => ({ ...row, skills: Array.isArray(row.skills) ? (row.skills as string[]) : [] }))

  const digest = rankMatches(candidate, vacancies, { windowDays })
  const strong = rankMatches(candidate, vacancies, { minScore: ALERT_MIN_SCORE, limit: 1, windowDays })
  const alert: RankedMatch | undefined = strong[0] ?? rankMatches(candidate, vacancies, { minScore: 0, limit: 1, windowDays })[0]
  if (digest.length === 0 || !alert) throw new Error(`No hay vacantes que encajen con ${username} en los últimos ${windowDays} días`)

  const name = firstName(user as never) === 'hola' ? null : firstName(user as never)
  const toItem = (match: RankedMatch, campaign: string, content: string): MatchItem => ({
    title: match.vacancy.title.trim(),
    meta: metaOf(match.vacancy),
    url: trackedLink(`/vacantes/${match.vacancy.slug}`, campaign, content, 'para-ti'),
    score: match.score,
    shared: pretty(match.shared),
    missing: pretty(match.missing),
  })

  console.log(`Perfil: ${username} (${candidate.roleCategory}, ${candidate.seniority}, ${candidate.skills.join('/')}, ${candidate.workModality}) · vacantes revisadas: ${vacancies.length} en ${windowDays} días`)
  console.log(`Resumen: ${digest.length} vacantes (mínimo ${DIGEST_MIN_SCORE} %): ${digest.map(match => `${match.score} %`).join(', ')}`)
  console.log(`Alerta: ${alert.score} % ${strong[0] ? `(pasa el umbral de ${ALERT_MIN_SCORE} %)` : `(NO llega a ${ALERT_MIN_SCORE} %: se usa como muestra, en producción esta alerta no saldría)`}`)

  const seeAll = (campaign: string) => trackedLink('/', campaign, 'ver-todas', 'para-ti')
  const emails = [
    ['Resumen semanal', renderDigest({ name, items: digest.map((match, index) => toItem(match, 'para-ti-semanal', `v${index + 1}`)), seeAllUrl: seeAll('para-ti-semanal') })],
    ['Alerta de coincidencia fuerte', renderAlert({ name, item: toItem(alert, 'para-ti-alerta', 'vacante'), seeAllUrl: seeAll('para-ti-alerta') })],
  ] as const

  const resend = new Resend(process.env.RESEND_API_KEY)
  for (const [label, email] of emails) {
    const { data, error } = await sendTracked(resend, { from: process.env.RESEND_FROM || DEFAULT_FROM, replyTo: process.env.RESEND_REPLY_TO || DEFAULT_REPLY_TO, to, subject: email.subject, html: email.html, text: email.text }, 'prueba')
    if (error) throw new Error(`Resend rechazó "${label}": ${error.name}: ${error.message}`)
    console.log(`${label} enviado (id ${data?.id}): ${email.subject}`)
    await new Promise(resolve => setTimeout(resolve, 600))
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })

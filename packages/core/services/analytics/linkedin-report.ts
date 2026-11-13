import ExcelJS from 'exceljs'
import { createHash } from 'crypto'

/**
 * Reporte semanal de LinkedIn: lee el Excel «Análisis conjunto» que LinkedIn exporta (se sube todos los lunes desde Telemetry) y lo
 * cruza con lo que medimos nosotros. El archivo es de LinkedIn: sus hojas, columnas y formatos pueden cambiar, así que las hojas se
 * buscan por nombre (sin acentos, aunque LinkedIn corta los nombres a 31 letras) y las columnas por su encabezado, nunca por posición.
 *
 * Lo que trae y lo que NO trae: el detalle por publicación solo viene para las 3 más recientes y las listas de las 50 con más
 * interacciones y las 50 con más impresiones; el resto del año solo está en las series por día. Por eso «cuadrar» una publicación
 * solo es posible cuando LinkedIn la incluyó.
 */

// ---------- lectura ----------

export interface ParsedPost {
  postKey: string
  url: string
  publishedOn: string | null
  postType: string | null
  impressions: number | null
  impressionsNetworkPct: number | null
  impressionsOutsidePct: number | null
  membersReached: number | null
  followersGained: number | null
  profileViews: number | null
  reactions: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  sends: number | null
  customButton: number | null
  linkClicks: number | null
  interactions: number | null
}

export interface ParsedReport {
  fileHash: string
  periodStart: string | null
  periodEnd: string | null
  impressions: number | null
  membersReached: number | null
  followersTotal: number | null
  daily: { day: string; impressions: number | null; interactions: number | null; newFollowers: number | null }[]
  posts: ParsedPost[]
  audience: { source: 'publico' | 'contenido'; category: string; value: string; pct: number | null; rank: number }[]
  warnings: string[]
}

/** Sin acentos, en minúsculas y con los espacios (incluido el espacio duro del «74 %») colapsados. */
export const norm = (value: unknown): string =>
  String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s ]+/g, ' ').trim().toLowerCase()

/** «3/11/2026» (día/mes/año, como lo exporta LinkedIn en español) -> «2026-11-03». Null si no es una fecha. */
export function parseDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // Un día que no existe (31 de febrero) se corre al mes siguiente: si al volver a escribir la fecha cambia, no era una fecha.
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').replace(/[\s ,]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

/** «74 %» -> 74; «< 1 %» -> 0.5 (menos de uno: no se sabe cuánto, se guarda la mitad); vacío -> null. */
export function parsePercent(value: unknown): number | null {
  const text = norm(value).replace('%', '').trim()
  if (!text) return null
  if (text.startsWith('<')) return 0.5
  return parseNumber(text)
}

/** El número largo de la publicación dentro de su dirección (`...-share-7523542032171106304-6f60`): es lo que la une con la nuestra. */
export function postKeyFromUrl(url: unknown): string | null {
  const match = /(?:share|ugcpost|activity)-(\d{15,})/i.exec(String(url ?? ''))
  return match ? match[1] : null
}

/** El mismo número dentro del id que guardamos al publicar (`urn:li:share:7523...`). */
export function postKeyFromUrn(urn: unknown): string | null {
  const match = /(\d{15,})/.exec(String(urn ?? ''))
  return match ? match[1] : null
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown; hyperlink?: string }
    if (rich.richText) return rich.richText.map((part) => part.text).join('')
    if (rich.text !== undefined) return rich.text
    if (rich.result !== undefined) return rich.result
  }
  return value ?? null
}

function rowsOf(sheet: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: unknown[] = []
    for (let index = 1; index <= Math.max(row.cellCount, sheet.columnCount); index++) values.push(cellValue(row.getCell(index)))
    rows.push(values)
  })
  return rows
}

function findSheet(workbook: ExcelJS.Workbook, prefix: string): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find((sheet) => norm(sheet.name).startsWith(prefix))
}

const FIELD_BY_HEADER: Record<string, keyof ParsedPost> = {
  'url de la publicacion': 'url',
  'fecha de publicacion': 'publishedOn',
  'tipo de publicacion': 'postType',
  'impresiones': 'impressions',
  'impresiones (de tu red)': 'impressionsNetworkPct',
  'impresiones (fuera de tu red)': 'impressionsOutsidePct',
  'miembros alcanzados': 'membersReached',
  'seguidores obtenidos': 'followersGained',
  'visualizaciones del perfil': 'profileViews',
  'reacciones': 'reactions',
  'comentarios': 'comments',
  'veces compartido': 'shares',
  'veces guardado': 'saves',
  'envios': 'sends',
  'interacciones con el boton personalizado': 'customButton',
  'visitas a enlaces': 'linkClicks',
  'interacciones': 'interactions',
}

const COUNT_FIELDS: (keyof ParsedPost)[] = ['followersGained', 'profileViews', 'reactions', 'comments', 'shares', 'saves', 'sends', 'customButton', 'linkClicks']

const emptyPost = (key: string, url: string): ParsedPost => ({
  postKey: key, url, publishedOn: null, postType: null, impressions: null, impressionsNetworkPct: null, impressionsOutsidePct: null, membersReached: null,
  followersGained: null, profileViews: null, reactions: null, comments: null, shares: null, saves: null, sends: null, customButton: null, linkClicks: null, interactions: null,
})

function setField(post: ParsedPost, field: keyof ParsedPost, raw: unknown): void {
  if (field === 'url' || field === 'postKey') return
  if (field === 'publishedOn') post.publishedOn = parseDay(raw) ?? post.publishedOn
  else if (field === 'postType') post.postType = raw ? String(raw) : post.postType
  else if (field === 'impressionsNetworkPct' || field === 'impressionsOutsidePct') (post as unknown as Record<string, unknown>)[field] = parsePercent(raw)
  else (post as unknown as Record<string, unknown>)[field] = parseNumber(raw)
}

/** Une lo que se sabe de una publicación venga de la hoja que venga: un dato lleno nunca se pisa con uno vacío. */
function mergePost(target: Map<string, ParsedPost>, incoming: ParsedPost): void {
  const current = target.get(incoming.postKey)
  if (!current) { target.set(incoming.postKey, incoming); return }
  for (const key of Object.keys(incoming) as (keyof ParsedPost)[]) {
    if (incoming[key] !== null && incoming[key] !== '' && (current[key] === null || current[key] === '')) (current as unknown as Record<string, unknown>)[key] = incoming[key]
  }
}

export async function parseLinkedInReport(buffer: Buffer): Promise<ParsedReport> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const warnings: string[] = []
  const report: ParsedReport = {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    periodStart: null, periodEnd: null, impressions: null, membersReached: null, followersTotal: null, daily: [], posts: [], audience: [], warnings,
  }

  // DESCUBRIMIENTO: periodo, impresiones y miembros alcanzados.
  const discovery = findSheet(workbook, 'descubrimiento')
  if (discovery) {
    for (const row of rowsOf(discovery)) {
      const label = norm(row[0])
      if (label.startsWith('rendimiento')) {
        const [start, end] = String(row[1] ?? '').split('-').map((part) => parseDay(part.trim()))
        report.periodStart = start ?? null
        report.periodEnd = end ?? null
      } else if (label === 'impresiones') report.impressions = parseNumber(row[1])
      else if (label.startsWith('miembros alcanzados')) report.membersReached = parseNumber(row[1])
    }
  } else warnings.push('No encontré la hoja DESCUBRIMIENTO.')

  // INTERACCIÓN: por día, impresiones e interacciones. SEGUIDORES: total y seguidores nuevos por día.
  const days = new Map<string, { day: string; impressions: number | null; interactions: number | null; newFollowers: number | null }>()
  const dayRow = (day: string) => days.get(day) ?? (days.set(day, { day, impressions: null, interactions: null, newFollowers: null }), days.get(day)!)
  const interaction = findSheet(workbook, 'interaccion')
  if (interaction) {
    for (const row of rowsOf(interaction)) {
      const day = parseDay(row[0])
      if (!day) continue
      const entry = dayRow(day)
      entry.impressions = parseNumber(row[1])
      entry.interactions = parseNumber(row[2])
    }
  } else warnings.push('No encontré la hoja INTERACCIÓN (impresiones por día).')
  const followers = findSheet(workbook, 'seguidores')
  if (followers) {
    for (const row of rowsOf(followers)) {
      if (norm(row[0]).startsWith('total de seguidores')) { report.followersTotal = parseNumber(row[1]); continue }
      const day = parseDay(row[0])
      if (day) dayRow(day).newFollowers = parseNumber(row[1])
    }
  } else warnings.push('No encontré la hoja SEGUIDORES.')
  report.daily = [...days.values()].sort((a, b) => a.day.localeCompare(b.day))

  // Publicaciones: las más recientes (todas las columnas) y las listas de principales (solo interacciones o impresiones).
  const posts = new Map<string, ParsedPost>()
  const recent = findSheet(workbook, 'publicaciones mas recientes')
  if (recent) {
    const rows = rowsOf(recent)
    const headers = (rows[0] ?? []).map((header) => FIELD_BY_HEADER[norm(header)] ?? null)
    for (const row of rows.slice(1)) {
      const key = postKeyFromUrl(row[headers.indexOf('url')])
      if (!key) continue
      const post = emptyPost(key, String(row[headers.indexOf('url')]))
      headers.forEach((field, index) => { if (field) setField(post, field, row[index]) })
      // En esta hoja una celda de conteo vacía significa 0 (nadie lo hizo). En las listas de principales ese dato no viene: queda sin saber.
      for (const field of COUNT_FIELDS) if (post[field] === null) (post as unknown as Record<string, unknown>)[field] = 0
      mergePost(posts, post)
    }
  } else warnings.push('No encontré la hoja PUBLICACIONES MÁS RECIENTES.')

  const top = findSheet(workbook, 'publicaciones principales')
  if (top) {
    const rows = rowsOf(top)
    const headerIndex = rows.findIndex((row) => norm(row[0]) === 'url de la publicacion')
    if (headerIndex >= 0) {
      const header = rows[headerIndex]
      // Dos listas lado a lado: a la izquierda la columna de interacciones, a la derecha la de impresiones.
      const blocks: { url: number; date: number; metric: number; field: keyof ParsedPost }[] = []
      header.forEach((cell, index) => {
        if (norm(cell) !== 'url de la publicacion') return
        const metricHeader = norm(header[index + 2])
        const field = FIELD_BY_HEADER[metricHeader]
        if (field) blocks.push({ url: index, date: index + 1, metric: index + 2, field })
      })
      for (const row of rows.slice(headerIndex + 1)) {
        for (const block of blocks) {
          const key = postKeyFromUrl(row[block.url])
          if (!key) continue
          const post = emptyPost(key, String(row[block.url]))
          post.publishedOn = parseDay(row[block.date])
          setField(post, block.field, row[block.metric])
          mergePost(posts, post)
        }
      }
    } else warnings.push('No encontré las listas de PUBLICACIONES PRINCIPALES.')
  } else warnings.push('No encontré la hoja PUBLICACIONES PRINCIPALES.')
  report.posts = [...posts.values()]

  // Quién ve: «publico» (seguidores) y «contenido» (quienes vieron las publicaciones), por categoría.
  for (const [prefix, source] of [['informacion detallada del publi', 'publico'], ['informacion detallada del conte', 'contenido']] as const) {
    const sheet = findSheet(workbook, prefix)
    if (!sheet) continue
    const rank = new Map<string, number>()
    for (const row of rowsOf(sheet).slice(1)) {
      const category = String(row[0] ?? '').trim()
      const value = String(row[1] ?? '').trim()
      if (!category || !value) continue
      const position = (rank.get(category) ?? 0) + 1
      rank.set(category, position)
      report.audience.push({ source, category, value, pct: parsePercent(row[2]), rank: position })
    }
  }
  return report
}

// ---------- el reporte (lo que se muestra) ----------

export interface OurPostRow { post_key: string; vacancy_slug: string | null; company: string | null; role_category: string | null; published_at: string | null }
export interface OurVisits { people: number; active: number; registered: number }
export interface StoredPost {
  post_key: string; url: string | null; published_on: string | null; impressions: number | null; members_reached: number | null; link_clicks: number | null
  reactions: number | null; comments: number | null; shares: number | null; saves: number | null; interactions: number | null; followers_gained: number | null
}

export type Verdict = 'cuadra' | 'revisar' | 'pierde' | 'sin_clics' | 'sin_medicion' | 'no_es_nuestra'

export interface PostLine {
  postKey: string
  url: string | null
  publishedOn: string | null
  slug: string | null
  company: string | null
  role: string | null
  impressions: number | null
  membersReached: number | null
  linkClicks: number | null
  interactions: number | null
  followersGained: number | null
  /** Clics en el enlace / impresiones (lo que LinkedIn dice). */
  clickRatePct: number | null
  /** Personas que midió AvoTalent llegando desde esa publicación (null = antes de que existiera la medición propia o sin datos). */
  arrivals: number | null
  arrivalsActive: number | null
  registrations: number | null
  /** Llegadas medidas / clics que dice LinkedIn. */
  arrivalPct: number | null
  /** Registros / llegadas medidas: de la gente que llegó desde esta publicación, cuánta se registró. */
  conversionPct: number | null
  /** LinkedIn dio el detalle de esta publicación en el Excel (si no, solo se ve lo que midió AvoTalent). */
  inExcel: boolean
  verdict: Verdict
  note: string
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

/**
 * ¿Cuadra lo que dice LinkedIn con lo que medimos? Pura.
 *  - sin_medicion: la publicación salió antes de que midiéramos (o no tenemos su código): no se puede comparar.
 *  - sin_clics: tuvo impresiones pero LinkedIn no cuenta ningún clic en el enlace.
 *  - revisar: llegaron MÁS personas de las que LinkedIn dice que hicieron clic (el origen se mezcla con otras visitas o hay conteos duplicados).
 *  - pierde: LinkedIn cuenta clics que no llegan a medirse (salen antes de cargar, bloqueadores, el enlace no lleva el origen).
 */
export function judgePost(input: { impressions: number | null; linkClicks: number | null; arrivals: number | null; measured: boolean }): { verdict: Verdict; note: string } {
  const { impressions, linkClicks, arrivals, measured } = input
  if (!measured) return { verdict: 'sin_medicion', note: 'Salió antes de que AvoTalent midiera los orígenes: no se puede comparar.' }
  if (linkClicks === null) return { verdict: 'sin_medicion', note: 'LinkedIn solo dio impresiones o interacciones de esta publicación (no está entre las 3 más recientes): no hay clics para comparar.' }
  if ((impressions ?? 0) >= 100 && (linkClicks ?? 0) === 0) return { verdict: 'sin_clics', note: 'La vieron, pero nadie tocó el enlace (según LinkedIn).' }
  if (arrivals === null) return { verdict: 'sin_medicion', note: 'Falta el dato de llegadas.' }
  if (arrivals > linkClicks * 1.2 + 1) return { verdict: 'revisar', note: 'Llegaron más personas de las que LinkedIn dice que hicieron clic: se están mezclando otras visitas.' }
  if (linkClicks >= 5 && arrivals < linkClicks * 0.5) return { verdict: 'pierde', note: 'LinkedIn cuenta clics que no llegan a medirse: ¿carga lento, bloqueadores, o el enlace pierde el origen?' }
  return { verdict: 'cuadra', note: 'Lo que dice LinkedIn y lo que medimos van parejos.' }
}

export interface ReportInput {
  upload: { id: string; uploaded_at: string; file_name: string | null; period_start: string | null; period_end: string | null; impressions: number | null; members_reached: number | null; followers_total: number | null; posts: number } | null
  previousUpload: { followers_total: number | null; impressions: number | null } | null
  daily: { day: string; impressions: number | null; interactions: number | null; new_followers: number | null }[]
  posts: StoredPost[]
  ours: OurPostRow[]
  /** Por código de publicación (utm_content = slug de la vacante). */
  visits: Map<string, OurVisits> | null
  /** Desde cuándo mide AvoTalent (ISO) o null si no se sabe. */
  trackingSince: string | null
  audience: { source: string; category: string; value: string; pct: number | null; rank: number }[]
  today: string
}

export interface Week { from: string; to: string; impressions: number; interactions: number; newFollowers: number; days: number }

function weekOf(daily: ReportInput['daily'], from: string, to: string): Week {
  const inside = daily.filter((row) => row.day >= from && row.day <= to)
  const sum = (pick: (row: ReportInput['daily'][number]) => number | null) => inside.reduce((total, row) => total + (pick(row) ?? 0), 0)
  return { from, to, impressions: sum((row) => row.impressions), interactions: sum((row) => row.interactions), newFollowers: sum((row) => row.new_followers), days: inside.length }
}

const addDays = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)

export interface RoleLine { role: string; posts: number; impressions: number; linkClicks: number; arrivals: number; registrations: number; arrivalsPer1000: number | null }

export function buildLinkedInReport(input: ReportInput) {
  if (!input.upload) return { ready: true as const, empty: true as const }
  const ourByKey = new Map(input.ours.map((row) => [row.post_key, row]))
  const tracking = input.trackingSince ? input.trackingSince.slice(0, 10) : null

  const lines: PostLine[] = input.posts.map((post) => {
    const mine = ourByKey.get(post.post_key) ?? null
    const slug = mine?.vacancy_slug ?? null
    const seen = slug && input.visits ? input.visits.get(slug) ?? null : null
    const measured = !!mine && !!tracking && !!input.visits && (post.published_on ?? mine.published_at?.slice(0, 10) ?? '0000') >= tracking
    const arrivals = measured ? seen?.people ?? 0 : null
    const judgement = mine
      ? judgePost({ impressions: post.impressions, linkClicks: post.link_clicks, arrivals, measured })
      : { verdict: 'no_es_nuestra' as Verdict, note: 'LinkedIn la incluye, pero no está en lo que AvoTalent publicó (¿manual o de otra herramienta?).' }
    return {
      postKey: post.post_key, url: post.url, publishedOn: post.published_on, slug, company: mine?.company ?? null, role: mine?.role_category ?? null,
      impressions: post.impressions, membersReached: post.members_reached, linkClicks: post.link_clicks, interactions: post.interactions, followersGained: post.followers_gained,
      clickRatePct: post.impressions && post.link_clicks !== null ? pct(post.link_clicks, post.impressions) : null,
      arrivals, arrivalsActive: measured ? seen?.active ?? 0 : null, registrations: measured ? seen?.registered ?? 0 : null,
      arrivalPct: arrivals !== null && post.link_clicks ? pct(arrivals, post.link_clicks) : null,
      conversionPct: arrivals ? pct(measured ? seen?.registered ?? 0 : 0, arrivals) : null,
      inExcel: true,
      verdict: judgement.verdict, note: judgement.note,
    }
  })

  // Lo que LinkedIn no dio en el Excel (solo trae el detalle de unas cuantas) pero AvoTalent sí midió: se muestra igual, porque saber qué
  // publicación trajo más gente o registró más no depende del Excel sino de nuestras visitas.
  const inExcel = new Set(input.posts.map((post) => post.post_key))
  for (const mine of input.ours) {
    if (inExcel.has(mine.post_key) || !tracking || !input.visits || !mine.vacancy_slug) continue
    const publishedOn = mine.published_at?.slice(0, 10) ?? null
    if (!publishedOn || publishedOn < tracking) continue
    const seen = input.visits.get(mine.vacancy_slug) ?? null
    const arrivals = seen?.people ?? 0
    lines.push({
      postKey: mine.post_key, url: null, publishedOn, slug: mine.vacancy_slug, company: mine.company, role: mine.role_category,
      impressions: null, membersReached: null, linkClicks: null, interactions: null, followersGained: null, clickRatePct: null,
      arrivals, arrivalsActive: seen?.active ?? 0, registrations: seen?.registered ?? 0, arrivalPct: null,
      conversionPct: arrivals ? pct(seen?.registered ?? 0, arrivals) : null, inExcel: false,
      verdict: 'sin_medicion', note: 'LinkedIn no dio el detalle de esta publicación en el Excel: solo se ve lo que midió AvoTalent.',
    })
  }
  lines.sort((a, b) => (b.publishedOn ?? '').localeCompare(a.publishedOn ?? '') || (b.impressions ?? 0) - (a.impressions ?? 0))

  // Qué tipo de vacante funciona: solo con publicaciones nuestras y medidas.
  const byRole = new Map<string, RoleLine>()
  // Las llegadas por cada 1,000 impresiones solo cuentan las publicaciones de las que LinkedIn dio impresiones (si no, saldría subestimado).
  const arrivalsWithImpressions = new Map<string, number>()
  for (const line of lines.filter((item) => item.role && item.arrivals !== null)) {
    const row = byRole.get(line.role!) ?? { role: line.role!, posts: 0, impressions: 0, linkClicks: 0, arrivals: 0, registrations: 0, arrivalsPer1000: null }
    row.posts += 1
    if (line.impressions !== null) { row.impressions += line.impressions; arrivalsWithImpressions.set(line.role!, (arrivalsWithImpressions.get(line.role!) ?? 0) + (line.arrivals ?? 0)) }
    row.linkClicks += line.linkClicks ?? 0
    row.arrivals += line.arrivals ?? 0
    row.registrations += line.registrations ?? 0
    byRole.set(line.role!, row)
  }
  const roles = [...byRole.values()].map((row) => ({ ...row, arrivalsPer1000: row.impressions > 0 ? Math.round(((arrivalsWithImpressions.get(row.role) ?? 0) / row.impressions) * 10000) / 10 : null })).sort((a, b) => b.arrivals - a.arrivals)

  // La semana de lunes a domingo más reciente completa contra la anterior (con los días que LinkedIn ya entregó).
  const lastDay = input.daily.length > 0 ? input.daily[input.daily.length - 1].day : input.today
  const reference = lastDay > input.today ? input.today : lastDay
  const end = addDays(reference, -1) // el último día suele venir incompleto
  const current = weekOf(input.daily, addDays(end, -6), end)
  const previous = weekOf(input.daily, addDays(end, -13), addDays(end, -7))
  const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null)

  // Las que más gente trajeron y las que más registros dieron (solo publicaciones nuestras con medición).
  const measuredLines = lines.filter((line) => line.arrivals !== null)
  const top = {
    byArrivals: [...measuredLines].filter((line) => (line.arrivals ?? 0) > 0).sort((a, b) => (b.arrivals ?? 0) - (a.arrivals ?? 0) || (b.registrations ?? 0) - (a.registrations ?? 0)).slice(0, 5),
    byRegistrations: [...measuredLines].filter((line) => (line.registrations ?? 0) > 0).sort((a, b) => (b.registrations ?? 0) - (a.registrations ?? 0) || (b.arrivals ?? 0) - (a.arrivals ?? 0)).slice(0, 5),
  }

  const counts = lines.reduce<Record<string, number>>((acc, line) => ({ ...acc, [line.verdict]: (acc[line.verdict] ?? 0) + 1 }), {})

  return {
    ready: true as const,
    empty: false as const,
    upload: {
      uploadedAt: input.upload.uploaded_at, fileName: input.upload.file_name, periodStart: input.upload.period_start, periodEnd: input.upload.period_end,
      impressions: input.upload.impressions, membersReached: input.upload.members_reached, followersTotal: input.upload.followers_total, posts: input.upload.posts,
      followersSincePrevious: input.upload.followers_total !== null && input.previousUpload?.followers_total != null ? input.upload.followers_total - input.previousUpload.followers_total : null,
    },
    week: {
      current, previous,
      change: { impressions: change(current.impressions, previous.impressions), interactions: change(current.interactions, previous.interactions), newFollowers: change(current.newFollowers, previous.newFollowers) },
    },
    daily: input.daily.slice(-60),
    verdicts: counts,
    top,
    posts: lines,
    roles,
    audience: input.audience,
    trackingSince: tracking,
    notes: [
      'El detalle por publicación solo viene para las 3 más recientes y las listas de las 50 con más interacciones y con más impresiones. Las series por día sí cubren todo el año.',
      'Las llegadas son personas que AvoTalent midió entrando desde esa publicación (código de la vacante en el enlace); los clics son los que cuenta LinkedIn. No tienen por qué ser idénticos, pero deben ir parejos.',
      'Antes de que AvoTalent midiera los orígenes (30 de octubre de 2026) no hay con qué comparar: esas publicaciones salen «sin medición».',
    ],
  }
}

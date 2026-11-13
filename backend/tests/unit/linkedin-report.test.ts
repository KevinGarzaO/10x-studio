import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import express from 'express'
import request from 'supertest'

const db = vi.hoisted(() => ({ saved: 0 }))
vi.mock('@avotalent/core/services/supabase.service', () => ({ supabase: { from: () => ({}) } }))
vi.mock('@avotalent/core/services/analytics/linkedin-report-data', () => ({
  loadLinkedInReport: async () => ({ ready: true, empty: true }),
  saveLinkedInReport: async (parsed: { posts: unknown[]; daily: unknown[] }) => { db.saved += 1; return { ready: true, duplicate: false, uploadId: 'u1', posts: parsed.posts.length, days: parsed.daily.length } },
}))

import {
  buildLinkedInReport, judgePost, norm, parseDay, parseLinkedInReport, parseNumber, parsePercent, postKeyFromUrl, postKeyFromUrn,
  type ReportInput,
} from '@avotalent/core/services/analytics/linkedin-report'
import router from '../../src/routes/admin/analytics.routes'

const URL_A = 'https://www.linkedin.com/posts/alguien_staff-engineer-share-7523542032171106304-6f60'
const URL_B = 'https://www.linkedin.com/posts/alguien_senior-frontend-share-7523481635242311680-ZwX9'
const URL_C = 'https://www.linkedin.com/posts/alguien_data-engineer-share-7516868088898863105-6-T7'

/** Un Excel con la misma forma que el de LinkedIn («Análisis conjunto»), con datos inventados. */
async function sampleWorkbook(options: { dropSheet?: string } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const add = (name: string, rows: unknown[][]) => { if (name !== options.dropSheet) { const sheet = wb.addWorksheet(name); rows.forEach((row) => sheet.addRow(row)) } }
  add('DESCUBRIMIENTO', [['Rendimiento general', '5/11/2025 - 4/11/2026'], ['Impresiones', 44319], ['Miembros alcanzados', 13114]])
  add('INTERACCIÓN', [['Fecha', 'Impresiones', 'Interacciones'], ['2/11/2026', 100, 3], ['3/11/2026', 200, 4], ['4/11/2026', 50, 0]])
  add('PUBLICACIONES MÁS RECIENTES', [
    ['URL de la publicación', 'Fecha de publicación', 'Tipo de publicación', 'Impresiones', 'Impresiones (de tu red)', 'Impresiones (fuera de tu red)', 'Miembros alcanzados', 'Seguidores obtenidos', 'Visualizaciones del perfil', 'Reacciones', 'Comentarios', 'Veces compartido', 'Veces guardado', 'Envíos', 'Interacciones con el botón personalizado', 'Visitas a enlaces'],
    [URL_A, '3/11/2026', 'Artículo', 27, '74 %', '26 %', 20, 0, 0, 0, 0, 0, 0, 0, 0, null],
    [URL_B, '3/11/2026', 'Artículo', 199, '46 %', '54 %', 111, 0, 1, 1, 0, 0, 1, 0, 0, 7],
  ])
  add('PUBLICACIONES PRINCIPALES', [
    ['Esta lista puede incluir 50 publicaciones como máximo'], [],
    ['URL de la publicación', 'Fecha de publicación', 'Interacciones', null, 'URL de la publicación', 'Fecha de publicación', 'Impresiones'],
    [URL_C, '16/10/2026', 20, null, URL_C, '16/10/2026', 1439],
    [URL_B, '3/11/2026', 5, null, URL_B, '3/11/2026', 199],
  ])
  add('SEGUIDORES', [['Total de seguidores el 4/11/2026', 1679], [], ['Fecha', 'Nuevos seguidores'], ['3/11/2026', 3], ['4/11/2026', 2]])
  add('INFORMACIÓN DETALLADA DEL PÚBLI', [['Información detallada principal', 'Valor', 'Porcentaje'], ['Empresa', 'Janus Automation', '5 %'], ['Ubicación', 'Monterrey, NLE', '22 %'], ['Ubicación', 'Área metropolitana de CDMX', '< 1 %']])
  add('INFORMACIÓN DETALLADA DEL CONTE', [['Información detallada principal', 'Valor', 'Porcentaje'], ['Ubicación', 'Bogotá', '5 %']])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('helpers', () => {
  it('reads day/month/year dates, numbers and percentages as LinkedIn writes them', () => {
    expect(parseDay('3/11/2026')).toBe('2026-11-03')
    expect(parseDay('9/6/2026')).toBe('2026-06-09')
    expect(parseDay('31/2/2026')).toBeNull()
    expect(parseDay('hola')).toBeNull()
    expect(parseNumber('1,234')).toBe(1234)
    expect(parseNumber('')).toBeNull()
    expect(parsePercent('74 %')).toBe(74)
    expect(parsePercent('< 1 %')).toBe(0.5)
    expect(parsePercent('')).toBeNull()
    expect(norm('  Información   DETALLADA ')).toBe('informacion detallada')
  })
  it('ties our post to LinkedIn by the long number inside the address and the urn', () => {
    expect(postKeyFromUrl(URL_A)).toBe('7523542032171106304')
    expect(postKeyFromUrn('urn:li:share:7523542032171106304')).toBe('7523542032171106304')
    expect(postKeyFromUrl('https://example.com/x')).toBeNull()
  })
})

describe('parseLinkedInReport', () => {
  it('reads every sheet by name and every column by its header', async () => {
    const report = await parseLinkedInReport(await sampleWorkbook())
    expect(report).toMatchObject({ periodStart: '2025-11-05', periodEnd: '2026-11-04', impressions: 44319, membersReached: 13114, followersTotal: 1679, warnings: [] })
    expect(report.daily).toEqual([
      { day: '2026-11-02', impressions: 100, interactions: 3, newFollowers: null },
      { day: '2026-11-03', impressions: 200, interactions: 4, newFollowers: 3 },
      { day: '2026-11-04', impressions: 50, interactions: 0, newFollowers: 2 },
    ])
    expect(report.audience.find((row) => row.value === 'Monterrey, NLE')).toMatchObject({ source: 'publico', category: 'Ubicación', pct: 22, rank: 1 })
    expect(report.audience.find((row) => row.value === 'Bogotá')?.source).toBe('contenido')
  })

  it('joins a post across sheets without losing data; an empty count in the recent sheet is 0, a missing one in the top lists is unknown', async () => {
    const { posts } = await parseLinkedInReport(await sampleWorkbook())
    expect(posts).toHaveLength(3)
    const a = posts.find((post) => post.postKey === '7523542032171106304')!
    expect(a).toMatchObject({ impressions: 27, impressionsNetworkPct: 74, linkClicks: 0, publishedOn: '2026-11-03' })
    const b = posts.find((post) => post.postKey === '7523481635242311680')!
    expect(b).toMatchObject({ impressions: 199, linkClicks: 7, saves: 1, interactions: 5 })
    const c = posts.find((post) => post.postKey === '7516868088898863105')!
    expect(c).toMatchObject({ impressions: 1439, interactions: 20, linkClicks: null, reactions: null })
  })

  it('warns instead of failing when a sheet is missing, and refuses a file that is not an Excel', async () => {
    const report = await parseLinkedInReport(await sampleWorkbook({ dropSheet: 'SEGUIDORES' }))
    expect(report.warnings.join(' ')).toContain('SEGUIDORES')
    await expect(parseLinkedInReport(Buffer.from('esto no es un excel'))).rejects.toThrow()
  })
})

describe('judgePost', () => {
  it('compares what LinkedIn counts with what AvoTalent measured', () => {
    expect(judgePost({ impressions: 500, linkClicks: 10, arrivals: 8, measured: true }).verdict).toBe('cuadra')
    expect(judgePost({ impressions: 500, linkClicks: 10, arrivals: 2, measured: true }).verdict).toBe('pierde')
    expect(judgePost({ impressions: 500, linkClicks: 3, arrivals: 9, measured: true }).verdict).toBe('revisar')
    expect(judgePost({ impressions: 500, linkClicks: 0, arrivals: 0, measured: true }).verdict).toBe('sin_clics')
    expect(judgePost({ impressions: 500, linkClicks: 10, arrivals: 8, measured: false }).verdict).toBe('sin_medicion')
    expect(judgePost({ impressions: 1439, linkClicks: null, arrivals: 0, measured: true }).verdict).toBe('sin_medicion')
  })
  it('does not call a small post lost: with fewer than 5 clicks only a surplus is flagged', () => {
    expect(judgePost({ impressions: 80, linkClicks: 3, arrivals: 0, measured: true }).verdict).toBe('cuadra')
  })
})

describe('buildLinkedInReport', () => {
  const input = (patch: Partial<ReportInput> = {}): ReportInput => ({
    upload: { id: 'u1', uploaded_at: '2026-11-04T12:00:00Z', file_name: 'x.xlsx', period_start: '2025-11-05', period_end: '2026-11-04', impressions: 44319, members_reached: 13114, followers_total: 1679, posts: 3 },
    previousUpload: { followers_total: 1650, impressions: 40000 },
    daily: Array.from({ length: 16 }, (_, index) => ({ day: `2026-10-${String(20 + index).padStart(2, '0')}`.replace(/-(3[2-9]|[4-9]\d)$/, '-31'), impressions: index < 8 ? 100 : 200, interactions: 1, new_followers: 2 })),
    posts: [
      { post_key: '111111111111111111', url: 'u1', published_on: '2026-11-03', impressions: 500, members_reached: 300, link_clicks: 10, reactions: 1, comments: 0, shares: 0, saves: 0, interactions: 1, followers_gained: 0 },
      { post_key: '222222222222222222', url: 'u2', published_on: '2026-10-10', impressions: 900, members_reached: null, link_clicks: 20, reactions: null, comments: null, shares: null, saves: null, interactions: 12, followers_gained: null },
      { post_key: '333333333333333333', url: 'u3', published_on: '2026-11-02', impressions: 100, members_reached: 80, link_clicks: 1, reactions: 0, comments: 0, shares: 0, saves: 0, interactions: 0, followers_gained: 0 },
    ],
    ours: [
      { post_key: '111111111111111111', vacancy_slug: 'backend-a', company: 'Stripe', role_category: 'backend', published_at: '2026-11-03T15:00:00Z' },
      { post_key: '222222222222222222', vacancy_slug: 'front-b', company: 'Acme', role_category: 'frontend', published_at: '2026-10-10T15:00:00Z' },
    ],
    visits: new Map([['backend-a', { people: 8, active: 6, registered: 1 }]]),
    trackingSince: '2026-10-30T14:13:00Z',
    audience: [],
    today: '2026-11-05',
    ...patch,
  })

  it('puts each post with what we measured, marks the ones from before our measurement and the ones that are not ours', () => {
    const report = buildLinkedInReport(input())
    if (!report.ready || report.empty) throw new Error('vacío')
    const byKey = Object.fromEntries(report.posts.map((post) => [post.postKey, post]))
    expect(byKey['111111111111111111']).toMatchObject({ arrivals: 8, registrations: 1, arrivalPct: 80, clickRatePct: 2, verdict: 'cuadra', role: 'backend' })
    expect(byKey['222222222222222222']).toMatchObject({ arrivals: null, verdict: 'sin_medicion' })
    expect(byKey['333333333333333333'].verdict).toBe('no_es_nuestra')
    expect(report.verdicts).toEqual({ cuadra: 1, sin_medicion: 1, no_es_nuestra: 1 })
  })

  it('groups by type of vacancy using only our measured posts', () => {
    const report = buildLinkedInReport(input())
    if (!report.ready || report.empty) throw new Error('vacío')
    expect(report.roles).toEqual([{ role: 'backend', posts: 1, impressions: 500, linkClicks: 10, arrivals: 8, registrations: 1, arrivalsPer1000: 16 }])
  })

  it('compares the last 7 full days against the 7 before, leaving out the (incomplete) latest day, and reports followers since the last upload', () => {
    const report = buildLinkedInReport(input())
    if (!report.ready || report.empty) throw new Error('vacío')
    expect(report.week.current.days).toBeGreaterThan(0)
    expect(report.upload.followersSincePrevious).toBe(29)
  })

  it('also shows our measured posts that LinkedIn gave no detail for, and ranks who brought the most people and the most signups', () => {
    const report = buildLinkedInReport(input({
      ours: [
        ...input().ours,
        { post_key: '444444444444444444', vacancy_slug: 'data-c', company: 'Globex', role_category: 'data', published_at: '2026-11-01T15:00:00Z' },
        { post_key: '555555555555555555', vacancy_slug: 'viejo-d', company: 'Vieja', role_category: 'data', published_at: '2026-10-01T15:00:00Z' },
      ],
      visits: new Map([['backend-a', { people: 8, active: 6, registered: 1 }], ['data-c', { people: 30, active: 20, registered: 4 }]]),
    }))
    if (!report.ready || report.empty) throw new Error('vacío')
    const byKey = Object.fromEntries(report.posts.map((post) => [post.postKey, post]))
    // sin detalle de LinkedIn, pero con lo que midió AvoTalent
    expect(byKey['444444444444444444']).toMatchObject({ inExcel: false, arrivals: 30, registrations: 4, conversionPct: 13.3, impressions: null, url: null })
    // anterior a la medición propia: no se muestra
    expect(byKey['555555555555555555']).toBeUndefined()
    expect(report.top.byArrivals.map((line) => line.postKey)).toEqual(['444444444444444444', '111111111111111111'])
    expect(report.top.byRegistrations.map((line) => line.postKey)).toEqual(['444444444444444444', '111111111111111111'])
    // las llegadas por 1,000 impresiones no se subestiman con publicaciones sin impresiones
    expect(report.roles.find((row) => row.role === 'data')).toMatchObject({ posts: 1, impressions: 0, arrivals: 30, arrivalsPer1000: null })
    expect(report.roles.find((row) => row.role === 'backend')?.arrivalsPer1000).toBe(16)
  })

  it('says it is empty before the first upload', () => {
    expect(buildLinkedInReport(input({ upload: null }))).toEqual({ ready: true, empty: true })
  })

  it('does not break when we have no visits table yet', () => {
    const report = buildLinkedInReport(input({ visits: null }))
    if (!report.ready || report.empty) throw new Error('vacío')
    expect(report.posts.every((post) => post.arrivals === null)).toBe(true)
  })
})

describe('POST /linkedin-report', () => {
  const app = () => { const server = express(); server.use('/analytics', router); return server }

  it('reads an Excel sent as it is and saves it', async () => {
    db.saved = 0
    const res = await request(app()).post('/analytics/linkedin-report?name=x.xlsx').set('Content-Type', 'application/octet-stream').send(await sampleWorkbook())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ready: true, duplicate: false, posts: 3, days: 3, period: { start: '2025-11-05', end: '2026-11-04' } })
    expect(db.saved).toBe(1)
  })
  it('refuses something that is not an Excel, or an Excel without the LinkedIn sheets', async () => {
    const notExcel = await request(app()).post('/analytics/linkedin-report').set('Content-Type', 'application/octet-stream').send(Buffer.from('x'.repeat(300)))
    expect(notExcel.status).toBe(400)
    const wb = new ExcelJS.Workbook(); wb.addWorksheet('otra cosa').addRow(['a'])
    const empty = await request(app()).post('/analytics/linkedin-report').set('Content-Type', 'application/octet-stream').send(Buffer.from(await wb.xlsx.writeBuffer()))
    expect(empty.status).toBe(400)
    expect(db.saved).toBe(1)
  })
})

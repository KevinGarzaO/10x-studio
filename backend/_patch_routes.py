def edit(p, pairs):
    t = open(p, encoding='utf8', newline='').read()
    nl = '\r\n' if '\r\n' in t else '\n'
    for a, b in pairs:
        a = a.replace('\n', nl)
        b = b.replace('\n', nl)
        assert a in t, (p, a[:80])
        t = t.replace(a, b, 1)
    open(p, 'w', encoding='utf8', newline='').write(t)


edit('src/routes/admin/analytics.routes.ts', [
    ("import { loadPeopleValue, summarize,", "import { loadHistorySummary, loadEngagementStates, loadPersonHistory, markInvited, STATE_LABEL } from '../../../services/analytics/engagement-history'\nimport { loadPeopleValue, summarize,"),
    ("""router.get('/people-value', handle('personas de valor', async (_req, res) => {
  const rows = await loadPeopleValue()
  res.json({
    people: rows.sort(""", """router.get('/people-value', handle('personas de valor', async (_req, res) => {
  const [rows, history] = await Promise.all([loadPeopleValue(), loadEngagementStates().catch(() => null)])
  // El estado de compromiso sale de las fotos semanales (engagement-history.ts); sin la migración, no hay estado.
  const stateOf = (id: string) => (history?.ready ? history.states.get(id) ?? null : null)
  res.json({
    stateLabels: STATE_LABEL,
    stateReady: !!history?.ready,
    people: rows.map((row) => ({ ...row, state: stateOf(row.id) })).sort("""),
    ("""router.get('/people-value/summary', handle(""", """/** La evolución de UNA persona, semana por semana, y sus fechas clave. Solo el fundador: es de una persona concreta. */
router.get('/people-value/:id/history', handle('historial de una persona', async (req, res) => {
  const id = String(req.params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Identificador inválido' })
  const history = await loadPersonHistory(id)
  res.json(history ? { ready: true, ...history } : { ready: false })
}))

/** El fundador marca (o quita) a mano que a esta persona se le invitó: distingue a quien participó por invitación de quien lo hizo solo. */
router.post('/people-value/:id/invited', handle('marcar invitación', async (req, res) => {
  const id = String(req.params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Identificador inválido' })
  await markInvited(id, req.body?.invited !== false)
  res.json({ ok: true })
}))

/** El historial en conteos, por estado y por horizonte (1 mes, 6 meses, 1 año): sin correos ni nombres. Lo lee el agente. */
router.get('/engagement-history/summary', handle('historial de compromiso (conteos)', async (_req, res) => {
  res.json(await loadHistorySummary())
}))

router.get('/people-value/summary', handle("""),
])

edit('middleware/analytics-access.middleware.ts', [("'/people-value/summary', ", "'/people-value/summary', '/engagement-history/summary', ")])

edit('../packages/mcp-analytics/src/panel.ts', [("  people_value: {", """  engagement_history: { path: '/engagement-history/summary', about: 'Historial de compromiso: SOLO conteos. Foto semanal por cuenta real (cada lunes, Monterrey) guardada para siempre. Trae cuántas cuentas hay por estado (nueva, comprometida, en riesgo, dormida, reactivada, activa) y, por horizonte de 4, 26 y 52 semanas, la distribución de semanas activas, la participación repetida (2+ semanas distintas) y la reciprocidad (dieron y recibieron respuestas), más cuántos de los calientes de la foto base del 7 de nov siguen activos. Valor, enganche y temperatura solo existen desde el 7 de nov de 2026; antes hay semanas reconstruidas solo con actividad, comunidad y correos. Nunca correos ni nombres.' },
  people_value: {""")])

edit('services/cron.service.ts', [("  // 3b-bis. RECORDATORIO DE PERFIL", """  // 3b-historial. FOTO SEMANAL DE COMPROMISO: cada lunes 00:10 hora de Monterrey (06:10 UTC), una foto por cuenta real de la semana que terminó
  //     (valor, enganche, temperatura, días activos, comunidad, correos y push), guardada para siempre y sin sobrescribir
  //     (services/analytics/engagement-history.ts). Encendida por defecto: solo escribe en su propia tabla; se apaga con ENGAGEMENT_SNAPSHOTS=off.
  cron.schedule('10 6 * * 1', async () => {
    if (process.env.ENGAGEMENT_SNAPSHOTS === 'off') return
    try {
      const { takeWeeklySnapshot } = require('./analytics/engagement-history')
      const outcome = await takeWeeklySnapshot()
      console.log(`[FotoSemanal] ${outcome.status === 'skipped' ? `omitida: ${outcome.reason}` : `semana ${outcome.weekStart}: ${outcome.people} cuentas`}`)
    } catch (error) {
      console.error('[FotoSemanal] Error:', error)
    }
  })

  // 3b-bis. RECORDATORIO DE PERFIL"""),
])

edit('package.json', [('    "feed-visibility": "tsx scripts/feed-visibility.ts",', '    "feed-visibility": "tsx scripts/feed-visibility.ts",\n    "engagement-snapshot": "tsx scripts/engagement-snapshot.ts",')])
print('ok')

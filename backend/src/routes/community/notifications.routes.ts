import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()
router.use(communityAuthMiddleware)

/** Los correos de "Para ti" que se pueden apagar. Sin valor guardado, todo está encendido. */
export const EMAIL_PREF_KEYS = ['digest', 'alerts'] as const
export type EmailPrefs = Record<(typeof EMAIL_PREF_KEYS)[number], boolean>

export const withDefaults = (stored: unknown): EmailPrefs => {
  const source = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return { digest: source.digest !== false, alerts: source.alerts !== false }
}

// Los avisos de la persona: los 50 más recientes y cuántos no ha leído.
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('community_notifications')
      .select('id, type, message, link, read, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error

    const notifications = data ?? []
    res.json({ notifications, unread: notifications.filter(item => !item.read).length })
  } catch (error) {
    console.error('Notifications list error:', error)
    res.status(500).json({ error: 'Error al cargar tus notificaciones' })
  }
})

// Solo el número, para el puntito de la campana (se pide en cada página).
router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  try {
    const { count, error } = await supabase
      .from('community_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('read', false)
    if (error) throw error
    res.json({ unread: count ?? 0 })
  } catch {
    // Si falla, la campana simplemente no muestra el puntito.
    res.json({ unread: 0 })
  }
})

router.post('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.from('community_notifications').update({ read: true }).eq('user_id', req.userId).eq('read', false)
    if (error) throw error
    res.json({ ok: true })
  } catch (error) {
    console.error('Notifications read-all error:', error)
    res.status(500).json({ error: 'No se pudieron marcar como leídas' })
  }
})

router.post('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    // Solo las suyas: el filtro por user_id impide marcar las de otra persona.
    const { error } = await supabase.from('community_notifications').update({ read: true }).eq('id', req.params.id as string).eq('user_id', req.userId)
    if (error) throw error
    res.json({ ok: true })
  } catch (error) {
    console.error('Notification read error:', error)
    res.status(500).json({ error: 'No se pudo marcar como leída' })
  }
})

// Qué correos de "Para ti" quiere recibir.
router.get('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await supabase.from('users').select('email_prefs').eq('id', req.userId).maybeSingle()
    res.json({ preferences: withDefaults(data?.email_prefs) })
  } catch (error) {
    console.error('Notification prefs error:', error)
    res.status(500).json({ error: 'No se pudieron cargar tus preferencias' })
  }
})

router.put('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const { data } = await supabase.from('users').select('email_prefs').eq('id', req.userId).maybeSingle()
    const next = withDefaults(data?.email_prefs)
    for (const key of EMAIL_PREF_KEYS) if (typeof body[key] === 'boolean') next[key] = body[key] as boolean

    const { error } = await supabase.from('users').update({ email_prefs: next }).eq('id', req.userId)
    if (error) throw error
    res.json({ preferences: next })
  } catch (error) {
    console.error('Notification prefs save error:', error)
    res.status(500).json({ error: 'No se pudieron guardar tus preferencias' })
  }
})

export default router

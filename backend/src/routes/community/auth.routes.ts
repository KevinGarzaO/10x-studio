import { Router, Request, Response } from 'express'
import { supabase, createAuthClient } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, username, displayName } = req.body
    // Atribución del primer contacto (UTM/referrer) capturada en el cliente.
    const {
      signupSource, signupMedium, signupCampaign,
      signupContent, signupReferrer, signupLandingPath,
    } = req.body

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password y username son requeridos' })
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${username}`)
      .single()

    if (existingUser) {
      return res.status(409).json({ error: 'El email o username ya está en uso' })
    }

    const communityAppUrl = process.env.COMMUNITY_APP_URL || 'http://localhost:3002'
    const { data: authData, error: authError } = await createAuthClient().auth.signUp({
      email,
      password,
      options: {
        data: { username, displayName },
        emailRedirectTo: `${communityAppUrl}/onboarding`,
      },
    })

    if (authError) {
      return res.status(400).json({ error: authError.message })
    }

    if (authData.user) {
      await supabase.from('users').insert({
        id: authData.user.id,
        email,
        username,
        display_name: displayName || username,
        signup_source: signupSource || null,
        signup_medium: signupMedium || null,
        signup_campaign: signupCampaign || null,
        signup_content: signupContent || null,
        signup_referrer: signupReferrer || null,
        signup_landing_path: signupLandingPath || null,
      })
    }

    res.status(201).json({
      message: 'Cuenta creada exitosamente',
      user: authData.user,
      session: authData.session,
    })
  } catch (error) {
    console.error('Community Signup error:', error)
    res.status(500).json({ error: 'Error al crear la cuenta' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' })
    }

    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    res.json({
      message: 'Login exitoso',
      user: data.user,
      session: data.session,
    })
  } catch (error) {
    console.error('Community Login error:', error)
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
})

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body

    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token es requerido' })
    }

    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token })

    if (error || !data.session) {
      return res.status(401).json({ error: error?.message || 'No se pudo renovar la sesión' })
    }

    res.json({ session: data.session, user: data.user })
  } catch (error) {
    console.error('Community Refresh error:', error)
    res.status(500).json({ error: 'Error al renovar la sesión' })
  }
})

router.post('/logout', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase.auth.admin.signOut(req.userId!)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Sesión cerrada exitosamente' })
  } catch (error) {
    console.error('Community Logout error:', error)
    res.status(500).json({ error: 'Error al cerrar sesión' })
  }
})

router.get('/me', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId)
      .single()

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json({ user })
  } catch (error) {
    console.error('Community Get me error:', error)
    res.status(500).json({ error: 'Error al obtener el perfil' })
  }
})

// Proveedores OAuth disponibles. LinkedIn solo responde si está habilitado en el
// dashboard de Supabase (Authentication → Providers) con sus credenciales; GitHub
// ya está habilitado.
const OAUTH_PROVIDERS = ['github', 'linkedin'] as const

/**
 * Redirige al authorize de Supabase. Se usa el flujo implícito (tokens que
 * vuelven en el hash de la URL) para casar con captureSessionFromUrl() del
 * frontend, que ya sabe leerlos. El `redirect_to` debe estar en la lista blanca
 * de Redirect URLs del dashboard de Supabase.
 */
router.get('/oauth/:provider', (req: Request, res: Response) => {
  const provider = String(req.params.provider).toLowerCase()

  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
    return res.status(400).json({ error: 'Proveedor no soportado' })
  }

  const communityAppUrl = process.env.COMMUNITY_APP_URL || 'http://localhost:3002'
  const authorizeUrl =
    `${process.env.SUPABASE_URL}/auth/v1/authorize` +
    `?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(`${communityAppUrl}/auth/callback`)}`

  res.redirect(authorizeUrl)
})

/**
 * Después de volver de OAuth el navegador ya tiene sesión, pero la tabla `users`
 * solo se llena en el registro por email. Crea la fila si no existe para que
 * /auth/me funcione y el onboarding pueda continuar. Es idempotente: si la fila
 * ya existe, la devuelve sin tocarla.
 */
router.post('/sync-user', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.split(' ')[1]
    const { data: userData } = await supabase.auth.getUser(token)
    const authUser = userData?.user

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId)
      .maybeSingle()

    if (existing) {
      return res.json({ user: existing })
    }

    const meta = (authUser?.user_metadata || {}) as Record<string, string>
    const email = req.userEmail || authUser?.email || ''
    const displayName =
      meta.full_name || meta.name || email.split('@')[0] || 'Nuevo usuario'

    // Atribución del primer contacto, enviada por el frontend en el callback.
    const {
      signupSource, signupMedium, signupCampaign,
      signupContent, signupReferrer, signupLandingPath,
    } = (req.body || {}) as Record<string, string>

    let base = (meta.user_name || meta.preferred_username || email.split('@')[0] || displayName)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24)
    if (!base) base = 'user'
    if (!/^[a-z0-9]/.test(base)) base = `u_${base}`

    let username = base
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (!clash) break
      username = `${base}_${Math.random().toString(36).slice(2, 6)}`
    }

    const { data: created, error: insertError } = await supabase
      .from('users')
      .insert({
        id: req.userId, email, username, display_name: displayName,
        signup_source: signupSource || null,
        signup_medium: signupMedium || null,
        signup_campaign: signupCampaign || null,
        signup_content: signupContent || null,
        signup_referrer: signupReferrer || null,
        signup_landing_path: signupLandingPath || null,
      })
      .select('*')
      .single()

    if (insertError) throw insertError

    res.json({ user: created })
  } catch (error) {
    console.error('Community Sync user error:', error)
    res.status(500).json({ error: 'Error al sincronizar la cuenta' })
  }
})

export default router

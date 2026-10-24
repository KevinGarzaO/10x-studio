import { Router, Request, Response } from 'express'
import { supabase, createAuthClient } from '../../../services/supabase.service'
import { sanitizeAttribution } from '../../../services/attribution'
import { isProviderPhoto, mirrorProviderPhoto } from '../../../services/avatar'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, username, displayName } = req.body

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password y username son requeridos' })
    }

    // El username es único en toda la tabla; el correo solo lo reclama una
    // cuenta de correo: entre email, GitHub y LinkedIn el mismo correo puede
    // existir sin que sean la misma cuenta.
    const [{ data: nameClash }, { data: emailClash }] = await Promise.all([
      supabase.from('users').select('id').eq('username', username).maybeSingle(),
      supabase.from('users').select('id').eq('email', email).eq('provider', 'email').maybeSingle(),
    ])

    if (nameClash || emailClash) {
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
      const baseRow = {
        id: authData.user.id,
        email,
        username,
        display_name: displayName || username,
      }

      // El último origen UTM se manda al registrarse para atribuir la conversión
      // al enlace que llevó a la persona a crear su cuenta.
      const attribution = sanitizeAttribution(req.body.attribution)
      const origin = attribution && {
        signup_source: attribution.source,
        signup_medium: attribution.medium,
        signup_campaign: attribution.campaign,
        signup_content: attribution.content,
        signup_referrer: attribution.referrer,
        signup_landing_path: attribution.landingPath,
      }

      let { error: insertError } = await supabase
        .from('users')
        .insert({ ...baseRow, provider: 'email', ...origin })

      // Migración user-provider aún no aplicada: la cuenta se crea igual, sin
      // el proveedor (en cuanto corra user-provider-migration.sql ya no pasa).
      if (insertError && /provider/.test(insertError.message)) {
        console.warn('[Signup] Falta users.provider (aplica user-provider-migration.sql):', insertError.message)
        const { provider, ...sinProveedor } = { ...baseRow, provider: 'email', ...origin }
        ;({ error: insertError } = await supabase.from('users').insert(sinProveedor))
      }

      if (insertError && origin) {
        console.warn('[Signup] No se guardó el origen del registro:', insertError.message)
        await supabase.from('users').insert(baseRow)
      }
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

// Llave interna del proveedor en Supabase: LinkedIn es la variante OIDC
// (`linkedin_oidc`, scopes openid/email/profile). La llave `linkedin` es el
// proveedor legacy (r_liteprofile), retirado por LinkedIn y apagado.
const AUTHORIZE_KEYS: Record<string, string> = {
  github: 'github',
  linkedin: 'linkedin_oidc',
}

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

  // Detectar la URL del frontend de forma dinámica según el origen de la petición
  const originHeader = req.get('origin') || req.get('referer')
  let communityAppUrl = process.env.COMMUNITY_APP_URL || 'https://avotalent.app'

  if (originHeader) {
    try {
      const parsed = new URL(originHeader)
      if (
        parsed.hostname === 'avotalent.app' ||
        parsed.hostname.endsWith('.avotalent.app') ||
        parsed.hostname.endsWith('.vercel.app') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        communityAppUrl = parsed.origin
      }
    } catch {}
  }

  const authorizeUrl =
    `${process.env.SUPABASE_URL}/auth/v1/authorize` +
    `?provider=${AUTHORIZE_KEYS[provider]}` +
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

    const meta = (authUser?.user_metadata || {}) as Record<string, string>
    // La foto de la red social (avatar de GitHub/LinkedIn): quien llega por OAuth
    // no tiene que subir la suya, y de paso satisface la foto obligatoria del
    // perfil. Ese enlace VENCE (el de LinkedIn a las ~3 semanas), así que se copia a nuestro
    // almacenamiento y se guarda el enlace propio; si la copia falla se conserva el original.
    const providerPhotoUrl = meta.avatar_url || meta.picture || meta.image_url || null
    const mirroredPhoto = req.userId ? await mirrorProviderPhoto(providerPhotoUrl, req.userId) : null
    const providerPhoto = mirroredPhoto ?? providerPhotoUrl

    // LinkedIn entrega la foto en `picture` (GitHub en `avatar_url`). El
    // dashboard de Supabase solo dibuja `avatar_url`, así que se copia para
    // que la lista de Auth muestre la cara en vez del silueta. Un solo intento
    // por cuenta y nunca fatal: es cosmético.
    if (req.userId && meta.picture && !meta.avatar_url) {
      try {
        await supabase.auth.admin.updateUserById(req.userId, {
          user_metadata: { ...meta, avatar_url: meta.picture },
        })
      } catch (e) {
        console.warn('[SyncUser] No se pudo copiar picture a avatar_url:', e)
      }
    }

    // De dónde se autentica la cuenta ('github' | 'linkedin' | 'email'), para
    // saberlo en la tabla users y poder compartir correo entre proveedores sin
    // confundir cuentas. Supabase trae la llave interna (linkedin_oidc, etc.).
    const providerKey = String((authUser?.app_metadata as Record<string, string>)?.provider || 'email')
    const authProvider =
      providerKey === 'github' ? 'github'
        : providerKey.startsWith('linkedin') ? 'linkedin'
          : 'email'

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId)
      .maybeSingle()

    if (existing) {
      // Cuentas creadas antes de traer la foto de la red social: se completa una
      // sola vez y nunca se pisa una foto que la persona ya haya elegido.
      // Y una foto de red social que ya estaba guardada (y vence) se reemplaza por la copia: en cada entrada la
      // red social manda un enlace fresco, que es el momento de copiarlo.
      const replaceExpiring = isProviderPhoto(existing.photo_url) && !!mirroredPhoto
      if ((!existing.photo_url && providerPhoto) || replaceExpiring) {
        const { data: healed } = await supabase
          .from('users')
          .update({ photo_url: providerPhoto })
          .eq('id', req.userId)
          .select('*')
          .single()
        if (healed) return res.json({ user: healed })
      }
      return res.json({ user: existing })
    }

    const email = req.userEmail || authUser?.email || ''
    const displayName =
      meta.full_name || meta.name || email.split('@')[0] || 'Nuevo usuario'

    // Última atribución enviada por el frontend al volver del proveedor OAuth.
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

    const payload = {
      id: req.userId, email, username, display_name: displayName,
      photo_url: providerPhoto,
      provider: authProvider,
      signup_source: signupSource || null,
      signup_medium: signupMedium || null,
      signup_campaign: signupCampaign || null,
      signup_content: signupContent || null,
      signup_referrer: signupReferrer || null,
      signup_landing_path: signupLandingPath || null,
    }

    let { data: created, error: insertError } = await supabase
      .from('users')
      .insert(payload)
      .select('*')
      .single()

    // Migración user-provider aún no aplicada: la cuenta se crea igual, sin el
    // proveedor (en cuanto corra user-provider-migration.sql ya no pasa).
    if (insertError && /provider/.test(insertError.message)) {
      console.warn('[SyncUser] Falta users.provider (aplica user-provider-migration.sql):', insertError.message)
      const { provider, ...sinProveedor } = payload
      ;({ data: created, error: insertError } = await supabase
        .from('users')
        .insert(sinProveedor)
        .select('*')
        .single())
    }

    if (insertError) throw insertError

    res.json({ user: created })
  } catch (error) {
    console.error('Community Sync user error:', error)
    res.status(500).json({ error: 'Error al sincronizar la cuenta' })
  }
})

export default router

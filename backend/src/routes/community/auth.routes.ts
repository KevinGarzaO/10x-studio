import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, username, displayName } = req.body

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

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, displayName } },
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

    const { data, error } = await supabase.auth.signInWithPassword({
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

export default router

import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'
import { SubstackService } from '../services/substack.service'

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('users').select('*').single()
    if (error) return res.status(404).json({ error: 'Perfil no encontrado' })
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Error al obtener perfil' })
  }
}

export const getPosts = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { limit = 25, offset = 0 } = req.query
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)
    
    if (error) throw error
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Error al obtener posts' })
  }
}

export const getSubscribers = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { limit = 100, offset = 0 } = req.query
    const { data, error, count } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)
    
    if (error) throw error
    res.json({ subscribers: data, total: count || 0 })
  } catch {
    res.status(500).json({ error: 'Error al obtener suscriptores' })
  }
}

export const getStats = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { data, error } = await supabase
      .from('stats')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    
    if (error) throw error
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
}

export const createNote = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { content } = req.body
    const result = await SubstackService.publishNote(user.id, content)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Error al crear nota' })
  }
}

export const createDraft = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const result = await SubstackService.createDraft(user.id, req.body)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Error al crear draft' })
  }
}

export const updateDraft = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { id } = req.params
    const result = await SubstackService.updateDraft(user.id, id, req.body)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Error al actualizar draft' })
  }
}

export const scheduleDraft = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { id, scheduleAt } = req.body
    const result = await SubstackService.scheduleDraft(user.id, id, scheduleAt)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Error al programar draft' })
  }
}

export const addSubscriber = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { email } = req.body
    const result = await SubstackService.addSubscriber(user.id, email)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Error al añadir suscriptor' })
  }
}

export const publishArticle = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { title, content, subtitle, scheduleAt } = req.body
    if (!title || !content) return res.status(400).json({ error: 'Título y contenido son requeridos' })

    const result = await SubstackService.publishArticle(user.id, title, content, subtitle, scheduleAt)
    res.json(result)
  } catch (err: any) {
    console.error('[SubstackController] Publish error:', err)
    res.status(500).json({ error: err.message || 'Error al publicar artículo' })
  }
}

export const getCookies = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const { data, error } = await supabase.from('cookies').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Error al obtener cookies' })
  }
}

export const upsertCookies = async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('cookies').upsert(req.body)
    if (error) throw error
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Error al guardar cookies' })
  }
}

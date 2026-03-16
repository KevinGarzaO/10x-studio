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
    const { cookies, profile } = req.body
    
    // 1. Obtener o Crear Usuario
    // Usamos maybeSingle() para que no explote si la tabla está vacía tras un TRUNCATE
    let { data: user } = await supabase.from('users').select('id').maybeSingle()
    
    if (!user) {
      console.log('[SubstackController] No se encontró usuario, creando uno nuevo...')
      const { data: newUser, error: insertError } = await supabase.from('users').insert({
        name: profile?.name || 'Usuario',
        updated_at: new Date().toISOString()
      }).select('id').single()
      
      if (insertError) throw insertError
      user = newUser
    }

    if (!user) throw new Error('No se pudo determinar el ID del usuario')

    // 2. Guardar Cookies
    const cookieData = {
      user_id: user.id,
      substack_sid: cookies['substack.sid'] || cookies['substack-sid'] || cookies['connect.sid'],
      substack_lli: cookies['substack.lli'],
      visit_id: cookies['visit_id'],
      updated_at: new Date().toISOString()
    }
    
    await supabase.from('cookies').upsert(cookieData, { onConflict: 'user_id' })

    // 3. Guardar Perfil Inicial (enviado por la extensión)
    if (profile) {
      const initialUser = {
        name: profile.name,
        handle: profile.handle,
        substack_user_id: String(profile.id || ''),
        substack_slug: profile.slug,
        photo_url: profile.photo_url,
        bio: profile.bio,
        subdomain: profile.primaryPublication?.subdomain,
        publication_id: String(profile.primaryPublication?.id || profile.pubId || ''),
        updated_at: new Date().toISOString()
      }
      await supabase.from('users').update(initialUser).eq('id', user.id)
    }

    res.json({ ok: true, publication: profile?.primaryPublication?.subdomain, name: profile?.name })
  } catch (err: any) {
    console.error('[SubstackController] Error en upsertCookies:', err)
    res.status(500).json({ error: err.message || 'Error al guardar cookies' })
  }
}

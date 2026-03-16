import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'
import { SubstackService } from '../services/substack.service'

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        cookies:cookies (expires_at),
        publications:publications (*)
      `)
      .single()

    if (error) return res.status(404).json({ error: 'Perfil no encontrado' })
    
    console.log('[DEBUG] User fetched from DB:', { id: user.id, name: user.name, substack_user_id: user.substack_user_id })
    const publications = (user as any).publications || []
    console.log('[DEBUG] Publications fetched:', publications.map((p: any) => ({ name: p.name, is_primary: p.is_primary })))

    const cookiesArr = (user as any).cookies 
    const expiresAt = Array.isArray(cookiesArr) && cookiesArr.length > 0 
      ? cookiesArr[0].expires_at 
      : null

    const primaryPub = publications.find((p: any) => p.is_primary) || publications[0]

    const responseData = {
      ...user,
      expires_at: expiresAt,
      publication_name: primaryPub?.name,
      subdomain: primaryPub?.subdomain,
      publication_logo: primaryPub?.logo_url,
      publications,
      _debug: {
        userCount: (await supabase.from('users').select('id', { count: 'exact' })).count,
        pubCount: (await supabase.from('publications').select('id', { count: 'exact' })).count
      }
    }
    console.log('[DEBUG] Final response name:', responseData.name, 'Debug Info:', responseData._debug)
    res.json(responseData)
  } catch (err) {
    console.error('[SubstackController] Error en getProfile:', err)
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
    let { data: user }: { data: any } = await supabase.from('users').select('id, substack_slug').maybeSingle()
    
    if (!user) {
      const { data: newUser, error: insertError } = await supabase.from('users').insert({
        name: profile?.primaryPublication?.name || profile?.name || 'Usuario',
        updated_at: new Date().toISOString()
      }).select('id').single()
      
      if (insertError) throw insertError
      user = newUser
    }

    if (!user) throw new Error('No se pudo determinar el ID del usuario')

    // 2. Guardar Cookies con Expiración de 90 días
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 90)

    const cookieData = {
      user_id: user.id,
      substack_sid: cookies['substack.sid'] || cookies['substack-sid'] || cookies['connect.sid'],
      substack_lli: cookies['substack.lli'],
      visit_id: cookies['visit_id'],
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    }
    
    await supabase.from('cookies').upsert(cookieData, { onConflict: 'user_id' })

    // 3. Sincronización INMEDIATA TOTAL (Esperamos a todo para el primer segundo)
    const substackUserId = String(profile?.id || '')
    const finalSlug = profile?.primaryPublication?.subdomain || user.substack_slug || profile?.slug || profile?.handle || ''

    console.log(`[SubstackController] Iniciando sincronización total inmediata para ${finalSlug}...`)
    
    try {
      // PROMISE.ALL para garantizar que al terminar, TODO esté en la DB
      await Promise.all([
        SubstackService.syncProfile(user.id, substackUserId, finalSlug),
        SubstackService.syncStats(user.id, finalSlug),
        SubstackService.syncPosts(user.id, finalSlug),
        SubstackService.syncSubscribers(user.id, finalSlug)
      ])
      console.log(`[SubstackController] Sincronización total completada con éxito.`)
    } catch (err) {
      console.error(`[SubstackController] Error en sincronización total inicial:`, err)
    }

    // 4. Devolver datos enriquecidos para la extensión
    const { data: finalUser } = await supabase.from('users').select(`
      *,
      cookies:cookies (expires_at),
      publications:publications (*)
    `).eq('id', user.id).single()

    const cookiesArr = (finalUser as any).cookies
    const finalExpiresAt = Array.isArray(cookiesArr) && cookiesArr.length > 0 
      ? cookiesArr[0].expires_at 
      : expiresAt.toISOString()

    const publications = (finalUser as any).publications || []
    const primaryPub = publications.find((p: any) => p.is_primary) || publications[0]

    res.json({ 
      ok: true, 
      publication: finalUser?.subdomain || primaryPub?.subdomain || finalSlug, 
      publication_name: finalUser?.publication_name || primaryPub?.name || profile?.primaryPublication?.name,
      name: finalUser?.name || profile?.name,
      avatar: finalUser?.photo_url || profile?.photo_url,
      subCount: finalUser?.subscriber_count || 0,
      expiresAt: finalExpiresAt,
      publications
    })
  } catch (err: any) {
    console.error('[SubstackController] Error en upsertCookies:', err)
    res.status(500).json({ error: err.message || 'Error al guardar cookies' })
  }
}

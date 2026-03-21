import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'
import { SubstackService } from '../services/substack.service'
import { syncSubstackData } from '../services/cron.service'

export const getProfile = async (req: Request, res: Response) => {
  try {
    // 1. Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .single()

    if (error || !user) return res.status(404).json({ error: 'Perfil no encontrado' })
    
    console.log('[getProfile] User:', { id: user.id, name: user.name, substack_user_id: user.substack_user_id })

    // 2. Get cookies separately (avoids join issues)
    const { data: cookiesRow } = await supabase
      .from('cookies')
      .select('expires_at')
      .eq('user_id', user.id)
      .single()
    
    const expiresAt = cookiesRow?.expires_at || null
    console.log('[getProfile] Expires at:', expiresAt)

    // 3. Get publications — query by user_id
    const { data: publications } = await supabase
      .from('publications')
      .select('*')
      .eq('user_id', user.id)

    const pubs = publications || []
    console.log('[getProfile] Publications:', pubs.map((p: any) => ({ name: p.name, subdomain: p.subdomain })))

    const primaryPub = pubs.find((p: any) => p.is_primary) || pubs[0]

    // 4. Build response
    const responseData = {
      ...user,
      expires_at: expiresAt,
      publication_name: primaryPub?.name || null,
      subdomain: primaryPub?.subdomain || null,
      publication_logo: primaryPub?.logo_url || null,
      publications: pubs
    }
    console.log('[getProfile] Response: name=', responseData.name, 'pub=', responseData.publication_name, 'expires=', responseData.expires_at)
    res.json(responseData)
  } catch (err) {
    console.error('[SubstackController] Error en getProfile:', err)
    res.status(500).json({ error: 'Error al obtener perfil' })
  }
}

// TEMPORARY DEBUG - shows raw DB state to diagnose issues
export const debugDB = async (_req: Request, res: Response) => {
  try {
    const { data: users } = await supabase.from('users').select('*').limit(3)
    const { data: pubs } = await supabase.from('publications').select('*').limit(3)
    const { data: cookies } = await supabase.from('cookies').select('*').limit(3)
    const { data: subs, count } = await supabase.from('subscribers').select('*', { count: 'exact' }).limit(3)
    
    // Probe subscribers schema by trying a test insert (will fail but reveals columns)
    const { error: subSchemaErr } = await supabase.from('subscribers').insert({
      user_id: 'test-probe',
      email: 'probe@test.com',
      name: 'probe',
      type: 'free',
      country: '',
      active: true,
      stars: 0,
      opens7d: 0,
      opens30d: 0,
      opens6m: 0,
      revenue: 0,
      source: '',
      synced_at: new Date().toISOString()
    })
    // Delete the test row if it somehow worked
    await supabase.from('subscribers').delete().eq('email', 'probe@test.com')

    // Probe publications schema
    const { error: pubSchemaErr } = await supabase.from('publications').insert({
      publication_id: 0,
      name: 'probe',
      subdomain: 'probe',
      author_id: 0
    })
    await supabase.from('publications').delete().eq('subdomain', 'probe')

    res.json({
      users: {
        count: users?.length || 0,
        columns: users?.[0] ? Object.keys(users[0]) : [],
        rows: users
      },
      publications: {
        count: pubs?.length || 0,
        columns: pubs?.[0] ? Object.keys(pubs[0]) : [],
        rows: pubs,
        schemaProbeError: pubSchemaErr ? pubSchemaErr.message : 'OK (probe inserted)'
      },
      cookies: {
        count: cookies?.length || 0,
        columns: cookies?.[0] ? Object.keys(cookies[0]) : [],
        rows: cookies
      },
      subscribers: {
        count: count || 0,
        columns: subs?.[0] ? Object.keys(subs[0]) : [],
        sample: subs?.slice(0, 2),
        schemaProbeError: subSchemaErr ? subSchemaErr.message : 'OK (probe inserted)'
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
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

    // TOP LEADS: suscriptores con 4 o más estrellas
    const { count: topLeadsCount } = await supabase
      .from('subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('stars', 4)

    // AVG ESTRELLAS: promedio de estrellas
    const { data: starsData } = await supabase
      .from('subscribers')
      .select('stars')
      .eq('user_id', user.id)
      .not('stars', 'is', null)

    let avgStars: string | number = '—';
    if (starsData && starsData.length > 0) {
      const sum = starsData.reduce((acc, row) => acc + (row.stars || 0), 0)
      avgStars = (sum / starsData.length).toFixed(1)
    }

    res.json({ 
      subscribers: data, 
      total: count || 0,
      topLeads: topLeadsCount || 0,
      avgStars
    })
  } catch {
    res.status(500).json({ error: 'Error al obtener suscriptores' })
  }
}

export const getStats = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id, subscriber_count, follower_count').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { data } = await supabase
      .from('stats')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    // Si no hay stats en la tabla, regresar los del usuario
    res.json(data || { 
      subscriber_count: user.subscriber_count || 0,
      follower_count: user.follower_count || 0
    })
  } catch {
    res.status(500).json({ error: 'Error al obtener estadísticas' })
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

export const uploadImage = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { image, postId } = req.body
    if (!image || !postId) return res.status(400).json({ error: 'Faltan imagen o postId' })

    const result = await SubstackService.uploadImage(user.id, image, postId)
    res.json(result)
  } catch (e: any) {
    console.error('[SubstackController] Error uploading image:', e)
    res.status(500).json({ error: e.message || 'Error al subir imagen' })
  }
}

export const createNote = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    const { content } = req.body
    const result = await SubstackService.publishNote(user.id, content)
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
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

    const { title, content, subtitle, scheduleAt, draftId } = req.body
    if (!title || !content) return res.status(400).json({ error: 'Título y contenido son requeridos' })

    const result = await SubstackService.publishArticle(user.id, title, content, subtitle, scheduleAt, draftId)
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
    console.log('[upsertCookies] Body recibido:', JSON.stringify({ profile }, null, 2))


    // 1. Obtener o Crear Usuario
    const substackUserId = String(profile?.id || '')
    let { data: users }: { data: any } = await supabase.from('users').select('id, substack_slug').eq('substack_user_id', substackUserId).limit(1)
    let user = users?.[0]
    
    if (!user) {
      const { data: newUser, error: insertError } = await supabase.from('users').insert({
        substack_user_id: substackUserId,
        name: profile?.name || profile?.primaryPublication?.name || 'Usuario',
        substack_slug: `${substackUserId}-${profile?.handle || profile?.slug || ''}`,
        subdomain: profile?.primaryPublication?.subdomain || '',
        updated_at: new Date().toISOString()
      }).select('id, substack_slug').single()
      
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
      cf_clearance: cookies['cf_clearance'],
      cf_bm: cookies['__cf_bm'],
      ab_testing_id: cookies['ab_testing_id'],
      cookie_storage_key: cookies['cookie_storage_key'],
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    }
    
    await supabase.from('cookies').upsert(cookieData, { onConflict: 'user_id' })

    // 3. Sincronización INMEDIATA TOTAL usando la misma lógica del cron
    console.log(`[SubstackController] Iniciando sincronización total inmediata para user: ${user.id}...`)
    try {
      await syncSubstackData(user.id)
      console.log(`[SubstackController] Sincronización total completada con éxito.`)
    } catch (err) {
      console.error(`[SubstackController] Error en sincronización total inicial:`, err)
    }

    // 4. Devolver datos enriquecidos para la extensión
    const { data: finalUser } = await supabase.from('users').select('*').eq('id', user.id).single()

    // Get cookies separately
    const { data: cookiesRow } = await supabase.from('cookies').select('expires_at').eq('user_id', user.id).single()
    const finalExpiresAt = cookiesRow?.expires_at || expiresAt.toISOString()

    // Get publications by user_id
    const { data: pubs } = await supabase.from('publications').select('*').eq('user_id', user.id)
    const publications = pubs || []
    const primaryPub = publications.find((p: any) => p.is_primary) || publications[0]

    const userHandle = profile?.slug || profile?.handle || ''
    const pubSubdomain = primaryPub?.subdomain || profile?.primaryPublication?.subdomain || user.substack_slug?.replace(`${substackUserId}-`, '') || ''
    const syncSlug = user.substack_slug || `${substackUserId}-${userHandle}`

    console.log(`[upsertCookies] Final response: name=${finalUser?.name}, pub=${primaryPub?.name}, expires=${finalExpiresAt}, pubs=${publications.length}`)

    res.json({ 
      ok: true, 
      publication: primaryPub?.subdomain || pubSubdomain || syncSlug, 
      publication_name: primaryPub?.name || profile?.primaryPublication?.name,
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

export const deleteCookies = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { error } = await supabase.from('cookies').delete().eq('user_id', user.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[SubstackController] Error en deleteCookies:', err)
    res.status(500).json({ error: err.message || 'Error al eliminar cookies' })
  }
}

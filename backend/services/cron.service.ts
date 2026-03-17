import cron from 'node-cron'
import { supabase } from './supabase.service'
import { SubstackService } from './substack.service'

export const syncSubstackData = async (userIdStr?: string) => {
  try {
    let query = supabase.from('users').select('id, substack_user_id, substack_slug, subdomain')
    if (userIdStr) query = query.eq('id', userIdStr)
    
    const { data: users, error } = await query
    
    if (error) throw error

    for (const user of users) {
      if (!user.substack_slug) continue // Skip if not fully setup

      try {
        console.log(`[Cron] Sincronizando usuario: ${user.substack_slug}`)
        
        // 1. Sincronizar perfil (también actualiza publications)
        await SubstackService.syncProfile(user.id, user.substack_user_id, user.substack_slug)
        
        // Si no tenemos subdomain en users, lo sacamos de publications
        let subdomain = user.subdomain
        if (!subdomain) {
          const { data: pubs } = await supabase.from('publications').select('subdomain').eq('user_id', user.id)
          subdomain = pubs?.[0]?.subdomain
        }

        if (subdomain) {
          // 2. Sincronizar posts
          await SubstackService.syncPosts(user.id, subdomain)
          
          // 3. Sincronizar estadísticas
          await SubstackService.syncStats(user.id, subdomain)

          // 4. Sincronizar lista de suscriptores completa
          await SubstackService.syncSubscribers(user.id, subdomain)
        }
        
        console.log(`[Cron] Sincronización completada para: ${user.substack_slug}`)
      } catch (innerError) {
        console.error(`[Cron] Error sincronizando usuario ${user.substack_slug}:`, innerError)
      }
    }
  } catch (error) {
    console.error('Error general en syncSubstackData:', error)
  }
}

export const initCron = () => {
  // Cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    console.log('Iniciando sincronización programada:', new Date().toISOString())
    await syncSubstackData()
  })
  
  console.log('Cron service initialized (Every 15 minutes)')
}


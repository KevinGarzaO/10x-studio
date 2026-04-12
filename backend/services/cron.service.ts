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
        
        // Extraer solo el handle del slug (280221962-kevin-garza → kevin-garza)
const handle = user.substack_slug?.split('-').slice(1).join('-') || user.substack_slug
await SubstackService.syncProfile(user.id, user.substack_user_id, handle)
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

import { AutoPublisherService } from './auto_publisher.service'

export const initCron = () => {
  // 1. Existing Data Sync Cron (Every 15 mins)
  cron.schedule('*/15 * * * *', async () => {
    console.log('Iniciando sincronización programada:', new Date().toISOString())
    await syncSubstackData()
  })
  
  // 2. Auto Publisher Cron (L, M, V a las 18:00 UTC = 12:00 PM Monterrey)
  cron.schedule('0 18 * * 1,3,5', async () => {
    console.log('[AutoPublisher CRON] Verificando inicio de autopublicación...');
    
    // Seguro de inicio: Solo desde la semana del Lunes 20 de Abril de 2026
    const startDate = new Date('2026-04-20T00:00:00.000Z');
    if (new Date() < startDate) {
      console.log('[AutoPublisher CRON] Aún no es Lunes 20. Omitiendo ejecución por ahora.');
      return;
    }

    console.log(`[AutoPublisher CRON] Es L, M o V a las 12 PM Monterrey. Lanzando Agente Autónomo...`);
    
    // Obtener al administrador/usuario principal (podemos sacarlo de los perfiles configurados)
    const { data: users } = await supabase.from('users').select('id, substack_user_id').not('substack_user_id', 'is', null).limit(1);
    
    if (users && users.length > 0) {
      // Llamar al Agente Maestro
      await AutoPublisherService.publishFlowForUser(users[0].id)
    } else {
      console.error('[AutoPublisher CRON] No se encontró usuario principal con cuenta de Substack conectada.');
    }
  })

  console.log('Cron services initialized (Sync=15m, AutoPublisher=L,M,V 12:00PM MTY desde el día 20)')
}



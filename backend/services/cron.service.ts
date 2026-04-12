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
  
  // 2. Substack Auto Publisher (L, M, V a las 12:00 PM Monterrey)
  cron.schedule('0 18 * * 1,3,5', async () => {
    console.log('[SubstackAuto] Verificando inicio...');
    const startDate = new Date('2026-04-20T00:00:00.000Z');
    if (new Date() < startDate) return;

    const { data: users } = await supabase.from('users').select('id, substack_user_id').not('substack_user_id', 'is', null).limit(1);
    if (users && users.length > 0) await AutoPublisherService.publishFlowForUser(users[0].id)
  })

  // 4. LinkedIn Auto Publisher - Turno 1 (L-S a las 12:00 PM Monterrey)
  cron.schedule('0 18 * * 1-6', async () => {
    console.log('[LinkedInAuto] Turno 12:00 PM iniciado...');
    const { data: users } = await supabase.from('users').select('id').limit(1).single();
    if (users) await AutoPublisherService.publishLinkedInAutoFlow(users.id)
  })

  // 5. LinkedIn Auto Publisher - Turno 2 (L-S a las 05:00 PM Monterrey)
  cron.schedule('0 23 * * 1-6', async () => {
    console.log('[LinkedInAuto] Turno 05:00 PM iniciado...');
    const { data: users } = await supabase.from('users').select('id').limit(1).single();
    if (users) await AutoPublisherService.publishLinkedInAutoFlow(users.id)
  })

  // 3. Global Scheduler (Every 15 minutes for pending posts)
  const { SchedulerService } = require('./scheduler.service')
  cron.schedule('*/15 * * * *', async () => {
    await SchedulerService.processPendingPosts()
  })

  console.log('Cron services initialized (Sync=15m, Substack=L,M,V 12PM, LinkedIn=L-S 12PM&5PM, Scheduler=15m)')
}



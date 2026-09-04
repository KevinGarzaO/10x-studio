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
      if (!user.substack_slug) continue

      try {
        console.log(`[Cron] Sincronizando usuario: ${user.substack_slug}`)
        
        const handle = user.substack_slug?.split('-').slice(1).join('-') || user.substack_slug
        await SubstackService.syncProfile(user.id, user.substack_user_id, handle)

        let subdomain = user.subdomain
        if (!subdomain) {
          const { data: pubs } = await supabase.from('publications').select('subdomain').eq('user_id', user.id)
          subdomain = pubs?.[0]?.subdomain
        }

        if (subdomain) {
          await SubstackService.syncPosts(user.id, subdomain)
          await SubstackService.syncStats(user.id, subdomain)
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
  // 1. Substack Data Sync (Every 15 mins)
  cron.schedule('*/15 * * * *', async () => {
    console.log('Iniciando sincronización programada:', new Date().toISOString())
    await syncSubstackData()
  })
  
  // Fecha global de inicio para evitar publicaciones antes de lo planeado
  const GLOBAL_START_DATE = new Date('2026-05-21T00:00:00.000Z');

  // 2. DAILY ORCHESTRATOR (L-D a las 11:45 AM Monterrey = 17:45 UTC)
  //    1 tema → 1 imagen → Blog ES + LinkedIn ES + Newsletter (solo L/M/V) + Blog EN + LinkedIn EN (solo L-V)
  cron.schedule('45 17 * * *', async () => {
    console.log('[DailyOrchestrator] Iniciando flujo diario...');
    if (new Date() < GLOBAL_START_DATE) return;

    const { data: users } = await supabase.from('users').select('id').limit(1).single();
    if (users) await AutoPublisherService.publishDailyContent(users.id)
  })

  // 3. ENGLISH 4PM PUBLISHER (L-D a las 4:00 PM Monterrey = 22:00 UTC)
  //    Publica blog EN + LinkedIn EN que fueron programados en el orquestador
  cron.schedule('0 22 * * *', async () => {
    console.log('[English4PM] Iniciando publicación de contenido en inglés...');
    if (new Date() < GLOBAL_START_DATE) return;

    const { data: users } = await supabase.from('users').select('id').limit(1).single();
    if (users) await AutoPublisherService.publishScheduledEnglishContent(users.id)
  })

  // 4. Global Scheduler (Every 15 minutes for pending posts)
  const { SchedulerService } = require('./scheduler.service')
  cron.schedule('*/15 * * * *', async () => {
    await SchedulerService.processPendingPosts()
  })

  // 5. Scraper crons (Discovery=6h, Production=30min, Sync=35min)
  const { initScraperCron } = require('./scraper/scheduler')
  initScraperCron()

  console.log('Cron services initialized (Sync=15m, DailyOrchestrator=11:45AM MT, English4PM=4PM MT daily, Scheduler=15m, Scraper=Discovery6h+Production30m)')
}

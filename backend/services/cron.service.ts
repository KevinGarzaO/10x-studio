import cron from 'node-cron'
import { supabase } from './supabase.service'
import { SubstackService } from './substack.service'

export const initCron = () => {
  // Cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    console.log('Iniciando sincronización programada:', new Date().toISOString())
    
    try {
      // Obtenemos todos los usuarios vinculados para sincronizar
      const { data: users, error } = await supabase
        .from('users')
        .select('id, substack_user_id, substack_slug, subdomain')
      
      if (error) throw error

      for (const user of users) {
        try {
          console.log(`Sincronizando usuario: ${user.substack_slug}`)
          
          // 1. Sincronizar perfil
          await SubstackService.syncProfile(user.id, user.substack_user_id, user.substack_slug)
          
          // 2. Sincronizar posts
          await SubstackService.syncPosts(user.id, user.subdomain)
          
          // 3. Sincronizar estadísticas y suscriptores
          await SubstackService.syncStats(user.id, user.subdomain)
          
          console.log(`Sincronización completada para: ${user.substack_slug}`)
        } catch (innerError) {
          console.error(`Error sincronizando usuario ${user.substack_slug}:`, innerError)
        }
      }
    } catch (error) {
      console.error('Error general en cron job:', error)
    }
  })
  
  console.log('Cron service initialized (Every 15 minutes)')
}

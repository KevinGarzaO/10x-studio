import { supabase } from './supabase.service'
import { LinkedInService } from './linkedin.service'

export class SchedulerService {
  /**
   * Process all pending posts whose scheduled time has arrived
   */
  static async processPendingPosts() {
    try {
      // 1. Fetch pending posts due now or in the past
      const { data: posts, error } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())

      if (error) {
        if (error.code !== 'PGRST116') console.error('[Scheduler] DB Error:', error)
        return
      }

      if (!posts || posts.length === 0) return

      console.log(`[Scheduler] Procesando ${posts.length} posts programados...`)

      for (const post of posts) {
        try {
          const { token, urn, text, imageBase64, imageUrl } = post.content

          // 2. Publish to LinkedIn
          const postId = await LinkedInService.publish({
            token,
            urn,
            text,
            imageBase64,
            imageUrl
          })

          // 3. Mark as published and save to history
          await supabase
            .from('scheduled_posts')
            .update({ status: 'published' })
            .eq('id', post.id)

          // 4. Save to Internal History (Optional but good for visibility)
          await supabase.from('linkedin_posts').upsert({
            user_id: post.user_id,
            post_id: postId,
            text: text,
            likes: 0,
            comments: 0,
            shares: 0,
            published_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          }, { onConflict: 'post_id' })

          console.log(`[Scheduler] ✅ Post ${post.id} publicado con éxito: ${postId}`)

        } catch (postErr: any) {
          console.error(`[Scheduler] ❌ Fallo en post ${post.id}:`, postErr.message)
          
          await supabase
            .from('scheduled_posts')
            .update({ 
               status: 'failed', 
               error_message: postErr.message 
            })
            .eq('id', post.id)
        }
      }
    } catch (globalErr) {
      console.error('[Scheduler] Critical failure:', globalErr)
    }
  }
}

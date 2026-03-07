// This file is loaded by Next.js once on server startup (Node.js runtime only)
// It starts the cron job that checks for scheduled Substack posts every hour

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const cron = await import('node-cron')

    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      try {
        console.log('[CRON] Verificando publicaciones programadas...')
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const res = await fetch(`${baseUrl}/api/cron`)
        const data = await res.json()
        console.log('[CRON] Resultado:', data)
      } catch (e) {
        console.error('[CRON] Error:', e)
      }
    })

    console.log('[CRON] Scheduler iniciado — revisando cada hora')
  }
}

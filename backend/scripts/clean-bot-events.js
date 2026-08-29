/**
 * Script para limpiar eventos de bots de la tabla post_events
 * 
 * Ejecutar: node scripts/clean-bot-events.js
 * 
 * Primero muestra cuántos eventos serán eliminados,
 * luego pide confirmación antes de eliminar.
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BOT_PATTERN = /bot|crawl|spider|slurp|mediapartners|feedly|rss|baiduspider|yandex|sogou|exabot|ia_archiver|facebookexternalhit|curl|wget|python|java\/|ruby|go-http|headlesschrome|puppeteer|semrush|ahrefs|mj12bot|dotbot|zoominfobot|seznambot|opensiteexplorer|伟大的航行|colorful\.garden|bytespider|gptbot|chatgpt-user|ccbot|claudebot|anthropic|applebot|bingpreview|meta-externalagent|tweetmeme|nutch|scrapy|httpclient|node-fetch|undici/i

async function main() {
  console.log('🔍 Buscando eventos de bots en post_events...\n')

  // Fetch all events with user_agent
  let allEvents = []
  let offset = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('post_events')
      .select('id, user_agent, event_type, visitor_id, content_id')
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('Error fetching events:', error.message)
      process.exit(1)
    }

    if (!data || data.length === 0) break
    allEvents = allEvents.concat(data)
    offset += batchSize

    if (data.length < batchSize) break
  }

  console.log(`📊 Total eventos en la base: ${allEvents.length}\n`)

  // Identify bot events
  const botEvents = allEvents.filter(e => BOT_PATTERN.test(e.user_agent || ''))
  const humanEvents = allEvents.filter(e => !BOT_PATTERN.test(e.user_agent || ''))

  // Stats
  const botViews = botEvents.filter(e => e.event_type === 'page_view').length
  const humanViews = humanEvents.filter(e => e.event_type === 'page_view').length
  const botScrolls = botEvents.filter(e => e.event_type === 'scroll_depth').length
  const humanScrolls = humanEvents.filter(e => e.event_type === 'scroll_depth').length

  // Unique visitors
  const botVisitors = new Set(botEvents.filter(e => e.event_type === 'page_view').map(e => e.visitor_id)).size
  const humanVisitors = new Set(humanEvents.filter(e => e.event_type === 'page_view').map(e => e.visitor_id)).size

  // Top bot user agents
  const botAgentCounts = {}
  botEvents.forEach(e => {
    const ua = (e.user_agent || 'unknown').substring(0, 80)
    botAgentCounts[ua] = (botAgentCounts[ua] || 0) + 1
  })
  const topBots = Object.entries(botAgentCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)

  console.log('═══════════════════════════════════════════')
  console.log('  RESUMEN DE LIMPIEZA')
  console.log('═══════════════════════════════════════════\n')
  console.log(`  🤖 Eventos de BOT a eliminar:  ${botEvents.length}`)
  console.log(`     - Page views:               ${botViews}`)
  console.log(`     - Scroll events:            ${botScrolls}`)
  console.log(`     - Visitantes únicos (bots): ${botVisitors}\n`)
  console.log(`  👤 Eventos HUMANOS a conservar: ${humanEvents.length}`)
  console.log(`     - Page views:               ${humanViews}`)
  console.log(`     - Scroll events:            ${humanScrolls}`)
  console.log(`     - Visitantes únicos:        ${humanVisitors}\n`)

  if (topBots.length > 0) {
    console.log('  📋 Top bots detectados:')
    topBots.forEach(([ua, count]) => {
      console.log(`     ${count}x  ${ua}`)
    })
    console.log()
  }

  if (botEvents.length === 0) {
    console.log('✅ No hay eventos de bots para limpiar.')
    return
  }

  // Confirm
  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise(resolve => rl.question(`❓ ¿Eliminar ${botEvents.length} eventos de bots? (s/n): `, resolve))
  rl.close()

  if (answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'si') {
    console.log('❌ Cancelado.')
    return
  }

  // Delete in batches
  console.log('\n🗑️  Eliminando eventos de bots...')
  const botIds = botEvents.map(e => e.id)
  const deleteBatchSize = 500
  let deleted = 0

  for (let i = 0; i < botIds.length; i += deleteBatchSize) {
    const batch = botIds.slice(i, i + deleteBatchSize)
    const { error } = await supabase
      .from('post_events')
      .delete()
      .in('id', batch)

    if (error) {
      console.error('Error deleting batch:', error.message)
    } else {
      deleted += batch.length
      process.stdout.write(`   ${deleted}/${botIds.length} eliminados...\r`)
    }
  }

  console.log(`\n\n✅ ¡Limpieza completada! ${deleted} eventos de bots eliminados.`)
  console.log(`   Quedan ${humanEvents.length} eventos humanos en la base.\n`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

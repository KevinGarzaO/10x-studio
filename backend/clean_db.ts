import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function clean() {
  console.log('Borrando datos para resetear e iniciar sincronización limpia...')
  const { error: pErr } = await supabase.from('publications').delete().neq('id', 'dummy')
  console.log('Publications borradas:', pErr || 'OK')
  
  const { error: uErr } = await supabase.from('users').delete().neq('id', 'dummy')
  console.log('Users borrados:', uErr || 'OK')
}

clean()

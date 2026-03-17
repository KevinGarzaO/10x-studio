import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') })

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: u } = await supabase.from('users').select('*').limit(1)
  console.log('User keys:', u ? Object.keys(u[0]) : 'None')

  const { data: p } = await supabase.from('publications').select('*').limit(1)
  console.log('Pub keys:', p ? Object.keys(p[0]) : 'None')
}

check()

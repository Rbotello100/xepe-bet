import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8').split('\n').reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/)
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, '')
  return a
}, {})

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const FIXES = {
  'Cape Verde': '🇨🇻',
  'Ivory Coast': '🇨🇮',
  'Turkey': '🇹🇷',
  'USA': '🇺🇸',
}

for (const [name, flag] of Object.entries(FIXES)) {
  const { error } = await sb.from('teams').update({ flag }).eq('name', name)
  console.log(error ? `FAIL ${name}: ${error.message}` : `OK ${name} → ${flag}`)
}

const { data } = await sb.from('teams').select('name, flag').eq('flag', '⚽')
console.log('\nRemaining with soccer ball:', data?.length ?? 0)
if (data?.length) console.log(data)

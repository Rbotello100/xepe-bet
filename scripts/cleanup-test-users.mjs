#!/usr/bin/env node
// Limpieza de users de testing que quedaron en producción por cleanup fallido
// de audit-stress.mjs o stress-test.mjs. Detecta por email matching:
//   *@xepetest.local | audit-* | stress-* | smoke-*

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Buscando users de test en profiles...')
  // El ranking lee de profiles. Borramos las rows de profiles + cascade de
  // dependencias. Identificamos test users por display_name (Audit/Stress/Smoke)
  // o por email correlacionado en auth.users.
  const { data: profilesByName } = await sb.from('profiles')
    .select('id, display_name, credits')
    .or('display_name.ilike.Audit %,display_name.ilike.Stress %,display_name.ilike.Smoke %,display_name.ilike.HTTPStress%')

  const testUsers = (profilesByName ?? []).map(p => ({ id: p.id, email: p.display_name }))
  console.log(`Encontrados: ${testUsers.length} profiles de test`)
  if (testUsers.length === 0) { console.log('Nada que borrar.'); return }

  let ok = 0, fail = 0
  for (const u of testUsers) {
    try {
      const { data: parlays } = await sb.from('parlays').select('id').eq('user_id', u.id)
      for (const p of parlays ?? []) await sb.from('parlay_legs').delete().eq('parlay_id', p.id)
      await sb.from('parlays').delete().eq('user_id', u.id)
      await sb.from('bets').delete().eq('user_id', u.id)
      await sb.from('mines_sessions').delete().eq('user_id', u.id)
      await sb.from('penalty_sessions').delete().eq('user_id', u.id)
      await sb.from('felipe_sessions').delete().eq('user_id', u.id)
      await sb.from('predictions').delete().eq('user_id', u.id)
      await sb.from('casino_sessions').delete().eq('user_id', u.id)
      await sb.from('activity_feed').delete().eq('user_id', u.id)
      await sb.from('ai_feed').delete().eq('user_id', u.id)
      await sb.from('credit_transactions').delete().eq('user_id', u.id)
      await sb.from('bet_throttle').delete().eq('user_id', u.id)
      await sb.from('error_log').delete().like('source', 'audit.test.%')
      // Borrar profile primero (lo que muestra el ranking) — incluso si auth falla
      await sb.from('profiles').delete().eq('id', u.id)
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id)
      if (delErr) {
        // Si auth.users ya no existe, no es problema — el profile ya quedo borrado
        if (delErr.message?.includes('not found') || delErr.message?.includes('User not found')) {
          ok++; console.log(`  ✓ ${u.email} (profile borrado, auth user ya no existia)`)
        } else { fail++; console.log(`  ✗ ${u.email}: ${delErr.message}`) }
      } else { ok++; console.log(`  ✓ ${u.email}`) }
    } catch (err) {
      fail++
      console.log(`  ✗ ${u.email}: ${err.message}`)
    }
  }
  console.log(`\nResumen: ${ok} borrados, ${fail} fallaron`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })

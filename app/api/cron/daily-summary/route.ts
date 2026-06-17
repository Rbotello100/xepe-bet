import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildDailySummary } from '@/features/admin/daily-summary/queries'

// Genera el resumen del DIA ANTERIOR (Chile) y lo guarda en daily_summaries.
// Corre 8 AM Chile (12 UTC) cuando ya cerro el dia previo.
// Idempotente: UNIQUE(day) → si ya existe, hace UPDATE.
export const maxDuration = 60

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  // Dia objetivo = ayer en Chile. Hoy 12 UTC = 08 AM CL → ayer en Chile
  // termino hace 8 horas. Tomamos hoy - 1 dia en UTC y le pedimos a
  // buildDailySummary el rango Chile correspondiente.
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  try {
    const summary = await buildDailySummary(yesterday)
    const day = yesterday.toISOString().slice(0, 10)

    const admin = createAdminClient()
    const { error } = await admin
      .from('daily_summaries')
      .upsert({ day, content: summary.content, metadata: summary.metadata }, { onConflict: 'day' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ day, length: summary.content.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler

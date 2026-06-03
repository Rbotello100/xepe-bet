import { NextResponse } from 'next/server'
import { refreshTemplateFeed } from '@/features/relator/templates'
import { verifyCronAuth } from '@/lib/auth/cron'

// Refresca los mensajes del Relator generados por templates (sin IA).
// Llamado por GitHub Actions cada 15 min. Es independiente del cron de IA
// porque cada uno solo desactiva mensajes con su propia metadata.source.
export const maxDuration = 30

async function handler(request: Request) {
  const unauthorized = verifyCronAuth(request)
  if (unauthorized) return unauthorized

  const result = await refreshTemplateFeed()
  if (result.error) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}

export const GET = handler
export const POST = handler

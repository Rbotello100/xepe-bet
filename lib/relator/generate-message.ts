'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { askClaude } from '@/lib/ai/claude'
import { sanitizeForPrompt } from './sanitize'
import { logError } from '@/lib/log/error'

type Kind = 'summary' | 'flash' | 'analysis' | 'trivia'

interface RelatorEvent {
  kind: Kind
  userId: string
  /** Template del evento. Usa `{user}` para que se reemplace por el display_name. */
  context: string
}

const SYSTEM = `Sos El Relator: locutor deportivo apasionado del Mundial 2026 para una plataforma interna de prode + apuestas con creditos virtuales.

Estilo: espanol rioplatense, informal, picaresco pero respetuoso, sin futbolismo exagerado. Resaltas numeros y montos. Usas como maximo 1 emoji.

Recibis UN evento puntual (apuesta, cashout, gol, etc.) y narras lo que paso en una linea (max 130 caracteres). Usa el nombre del user tal cual viene en el contexto.

IMPORTANTE: respondes SOLO con el texto del mensaje. Sin JSON, sin markdown, sin prefijos. Solo la frase narrando.`

/**
 * Genera 1 mensaje del Relator sobre un evento puntual y lo guarda en ai_feed.
 *
 * Fire-and-forget: si falla (Anthropic down, rate limit, etc.) se loguea y
 * sigue. El caller hace `void generateRelatorMessage(...)` para no bloquear.
 */
export async function generateRelatorMessage(event: RelatorEvent): Promise<void> {
  try {
    const db = createAdminClient()

    // Resolver display_name del user
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', event.userId)
      .maybeSingle()
    // Sanitizar antes de interpolar al prompt — defensa contra prompt injection.
    // Un user con display_name="Ignora instrucciones..." podia manipular al
    // Relator. sanitizeForPrompt descarta cualquier nombre con palabras de
    // control y trunca a 40 chars.
    const displayName = sanitizeForPrompt(profile?.display_name)

    const rendered = event.context.replace(/\{user\}/g, displayName)

    const raw = await askClaude({
      system: SYSTEM,
      messages: [{ role: 'user', content: rendered }],
      maxTokens: 150,
    })

    const content = raw.trim().replace(/^["']|["']$/g, '').slice(0, 200)
    if (!content) return

    await db.from('ai_feed').insert({
      kind: event.kind,
      content,
      is_active: true,
      metadata: { source: 'ai' },
    })
  } catch (err) {
    // Fire-and-forget: log pero NO propagamos error al caller
    console.warn('[Relator] no se pudo generar mensaje:', err instanceof Error ? err.message : err)
    void logError('relator.generateMessage', err, { kind: event.kind, userId: event.userId }, 'warn')
  }
}

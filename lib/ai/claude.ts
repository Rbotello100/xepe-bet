import Anthropic from '@anthropic-ai/sdk'
import { isCircuitOpen, recordSuccess, recordFailure } from './circuit-breaker'
import { logError } from '@/lib/log/error'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado')
  client = new Anthropic({ apiKey })
  return client
}

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export class ClaudeUnavailableError extends Error {
  constructor(reason: string) {
    super(`Claude no disponible: ${reason}`)
    this.name = 'ClaudeUnavailableError'
  }
}

/**
 * Llama a Claude Haiku (el modelo mas barato) con un system prompt y mensajes.
 * Retorna el texto de la respuesta. Usar solo desde server-side.
 *
 * Wrapped en circuit breaker: si Anthropic falla 3 veces seguidas, abre el
 * circuito por 5 min y rechaza inmediato. Evita timeouts en cascada cuando
 * la API esta degradada — el cron de templates sigue funcionando sin
 * depender de IA.
 */
export async function askClaude({
  system,
  messages,
  maxTokens = 1024,
}: {
  system: string
  messages: ClaudeMessage[]
  maxTokens?: number
}): Promise<string> {
  if (isCircuitOpen()) {
    throw new ClaudeUnavailableError('circuit breaker abierto (fallos previos)')
  }

  let res: Anthropic.Messages.Message
  try {
    const c = getClient()
    res = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages,
    })
    recordSuccess()
  } catch (err) {
    recordFailure()
    void logError('ai.askClaude', err, { maxTokens, systemPreview: system.slice(0, 80) })
    throw err
  }

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')

  return text.trim()
}

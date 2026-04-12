import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof _createBrowserClient> | null = null

export function createBrowserClient() {
  if (client) return client

  client = _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return client
}

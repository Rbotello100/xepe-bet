import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_EMAIL_DOMAIN = '@xepelin.com'

/**
 * Solo permitimos paths relativos internos: '/algo'. Rechazamos:
 * - '//evil.com'     (protocol-relative URL, redirige afuera del sitio)
 * - 'http://evil'    (URL absoluta)
 * - vacio/otros      (fallback a /)
 *
 * Previene open redirect para phishing con URL legitima de Xepe Bet.
 */
function sanitizeNextParam(next: string | null): string {
  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const safeNext = sanitizeNextParam(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=auth`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/?error=auth`)
  }

  // Verificar dominio de email server-side. Si la config OAuth de Supabase se
  // desajusta (o el attacker bypassa client-side restrictions), este check
  // sigue bloqueando usuarios fuera de Xepelin.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email?.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=invalid_domain`)
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}

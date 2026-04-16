import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes exempt from the terms-gate (always accessible without accepting T&C)
const TERMS_EXEMPT_ROUTES = [
  '/onboarding',
  '/terms',
  '/privacy',
  '/login',
  '/api/auth',
  '/api/cron',
]

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session on every request
  const { data: { user } } = await supabase.auth.getUser()

  // Gate: logged-in users must accept T&C before using the app
  if (user) {
    const pathname = request.nextUrl.pathname
    const isExempt = TERMS_EXEMPT_ROUTES.some((r) => pathname.startsWith(r))

    if (!isExempt) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('terms_accepted_at')
        .eq('id', user.id)
        .single()

      if (profile && !profile.terms_accepted_at) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

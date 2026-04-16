import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { acceptTerms } from '@/features/auth/actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default async function OnboardingPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at, display_name')
    .eq('id', user.id)
    .single()

  if (profile?.terms_accepted_at) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-10">
      <Card className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-4xl">⚽</p>
          <h1 className="text-2xl font-bold text-white">
            Bienvenido {profile?.display_name ?? ''}
          </h1>
          <p className="text-sm text-slate-400">
            Un paso mas antes de empezar a jugar
          </p>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300 space-y-3">
          <p>Para usar Mundial Betting necesitas aceptar:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li>
              Los{' '}
              <Link href="/terms" className="text-[var(--accent)] hover:underline">
                Terminos y Condiciones
              </Link>
            </li>
            <li>
              La{' '}
              <Link href="/privacy" className="text-[var(--accent)] hover:underline">
                Politica de Privacidad
              </Link>
            </li>
          </ul>
          <div className="pt-2 text-xs text-slate-500 space-y-1">
            <p>
              <strong className="text-slate-300">Recuerda:</strong> esta es una plataforma de
              entretenimiento con creditos virtuales. No hay dinero real en juego, ningun
              credito puede canjearse, y debes tener al menos 18 anos para usarla.
            </p>
          </div>
        </div>

        <form action={acceptTerms}>
          <Button type="submit" size="lg" className="w-full">
            Acepto los terminos y empezar a jugar
          </Button>
        </form>
      </Card>
    </div>
  )
}

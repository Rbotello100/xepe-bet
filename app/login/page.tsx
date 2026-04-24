import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { LoginButton } from '@/features/auth/components/LoginButton'
import { Card } from '@/components/ui/Card'

export default async function LoginPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-4xl">⚽</p>
          <h1 className="text-2xl font-bold text-white">Xepe Bet</h1>
          <p className="text-sm text-slate-400">Prode & Apuestas · Mundial 2026</p>
        </div>

        <p className="text-xs text-slate-500">
          Predice resultados, apuesta con creditos virtuales y compite en el ranking
        </p>

        <LoginButton />

        <p className="text-xs text-slate-600">
          Al iniciar sesion recibiras 1,000 creditos gratis
        </p>
      </Card>
    </div>
  )
}

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm text-center space-y-4">
        <p className="text-3xl">🔍</p>
        <h2 className="text-lg font-bold text-white">Pagina no encontrada</h2>
        <p className="text-sm text-slate-400">La pagina que buscas no existe</p>
        <Link href="/">
          <Button className="w-full">Volver al inicio</Button>
        </Link>
      </Card>
    </div>
  )
}

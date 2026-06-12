import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { requireAuth } from '@/lib/auth'
import { getDailyTrivia, canPlayToday } from '@/features/trivia/queries'
import { TriviaGame } from '@/features/trivia/components/TriviaGame'

export default async function TriviaPage() {
  const { userId, profile } = await requireAuth()
  const canPlay = await canPlayToday(userId)
  const questions = canPlay ? await getDailyTrivia(userId, 5) : []

  return (
    <>
      <Header user={profile} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-2">Trivia Mundialista</h1>
        <p className="text-sm text-slate-400 mb-6">Responde todas correctamente para ganar creditos</p>
        {!canPlay ? (
          <Card className="text-center py-8 space-y-2">
            <p className="text-3xl">🧠</p>
            <p className="text-white font-medium">Ya jugaste la trivia de hoy</p>
            <p className="text-sm text-slate-400">Vuelve manana para otra ronda</p>
          </Card>
        ) : questions.length === 0 ? (
          <Card className="text-center py-8 space-y-2">
            <p className="text-3xl">📝</p>
            <p className="text-white font-medium">No hay preguntas disponibles</p>
            <p className="text-sm text-slate-400">El admin debe agregar preguntas de trivia</p>
          </Card>
        ) : (
          <TriviaGame questions={questions} />
        )}
      </div>
    </>
  )
}

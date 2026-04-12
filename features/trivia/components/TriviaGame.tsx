'use client'

import { useState, useCallback } from 'react'
import { submitTrivia } from '@/features/trivia/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { TriviaQuestion } from '@/features/trivia/types'
import { clsx } from 'clsx'

interface TriviaGameProps {
  questions: TriviaQuestion[]
}

interface Answer {
  question_id: string
  selected_option: number
  is_correct: boolean
  time_taken_ms: number
}

export function TriviaGame({ questions }: TriviaGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState(false)
  const [result, setResult] = useState<{ correct_answers: number; total_questions: number; credits_earned: number } | null>(null)
  const [questionStartTime] = useState(Date.now())
  const [startTime, setStartTime] = useState(Date.now())

  const question = questions[currentIndex]

  const handleSelect = useCallback((optionIndex: number) => {
    if (revealed) return
    setSelectedOption(optionIndex)
    setRevealed(true)

    const isCorrect = optionIndex === question.correct_option
    const timeTaken = Date.now() - startTime

    const answer: Answer = {
      question_id: question.id,
      selected_option: optionIndex,
      is_correct: isCorrect,
      time_taken_ms: timeTaken,
    }

    setAnswers(prev => [...prev, answer])

    // Auto advance after 1.5s
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(i => i + 1)
        setSelectedOption(null)
        setRevealed(false)
        setStartTime(Date.now())
      } else {
        // Submit
        const allAnswers = [...answers, answer]
        setFinished(true)
        submitTrivia(allAnswers).then(res => {
          if (res && 'correct_answers' in res) setResult(res as typeof result)
        })
      }
    }, 1500)
  }, [revealed, question, currentIndex, questions.length, answers, startTime])

  if (finished) {
    const correct = result?.correct_answers ?? answers.filter(a => a.is_correct).length
    const total = questions.length
    const allCorrect = correct === total

    return (
      <Card className="text-center space-y-4 py-8">
        <p className="text-4xl">{allCorrect ? '🎉' : '😔'}</p>
        <h2 className="text-xl font-bold text-white">
          {allCorrect ? 'Trivia Perfecta!' : `${correct} de ${total} correctas`}
        </h2>
        {result && result.credits_earned > 0 && (
          <p className="text-lg text-emerald-400 font-semibold">+${result.credits_earned} creditos</p>
        )}
        {!allCorrect && (
          <p className="text-sm text-slate-400">Necesitas responder TODAS correctamente para ganar creditos</p>
        )}
      </Card>
    )
  }

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">Pregunta {currentIndex + 1} de {questions.length}</span>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={clsx('h-1.5 w-6 rounded-full', {
                'bg-emerald-500': i < currentIndex || (i === currentIndex && revealed && selectedOption === question.correct_option),
                'bg-red-500': i < answers.length && !answers[i]?.is_correct,
                'bg-slate-600': i > currentIndex,
                'bg-emerald-500/50': i === currentIndex && !revealed,
              })}
            />
          ))}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white">{question.question}</h2>

      <div className="space-y-2">
        {question.options.map((option, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={revealed}
            className={clsx(
              'w-full rounded-lg border px-4 py-3 text-left text-sm transition-all min-h-[44px]',
              revealed && i === question.correct_option && 'border-emerald-500 bg-emerald-500/20 text-emerald-400',
              revealed && i === selectedOption && i !== question.correct_option && 'border-red-500 bg-red-500/20 text-red-400',
              !revealed && 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500',
              revealed && i !== selectedOption && i !== question.correct_option && 'opacity-50',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </Card>
  )
}

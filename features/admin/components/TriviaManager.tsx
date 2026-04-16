'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createBrowserClient } from '@/lib/supabase/client'

export function TriviaManager() {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctOption, setCorrectOption] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleOptionChange = (index: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === index ? value : o))
  }

  const handleSubmit = async () => {
    if (!question || options.some(o => !o)) {
      setMessage('Completa todos los campos')
      return
    }

    setSaving(true)
    const supabase = createBrowserClient()
    const { error } = await supabase.from('trivia_questions').insert({
      question,
      options: JSON.stringify(options),
      correct_option: correctOption,
      difficulty: 'medium',
      category: 'general',
    })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Pregunta agregada')
      setQuestion('')
      setOptions(['', '', '', ''])
      setCorrectOption(0)
    }
    setSaving(false)
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium text-white">Agregar Pregunta de Trivia</p>

      <Input label="Pregunta" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Quien gano el Mundial 2022?" />

      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="correct"
            checked={correctOption === i}
            onChange={() => setCorrectOption(i)}
            className="accent-[var(--casino-red)]"
          />
          <Input
            value={opt}
            onChange={e => handleOptionChange(i, e.target.value)}
            placeholder={`Opcion ${i + 1}`}
          />
        </div>
      ))}

      <p className="text-xs text-slate-500">Selecciona la opcion correcta con el radio button</p>

      <Button onClick={handleSubmit} disabled={saving} className="w-full">
        {saving ? 'Guardando...' : 'Agregar pregunta'}
      </Button>

      {message && <p className="text-xs text-[var(--casino-teal)]">{message}</p>}
    </Card>
  )
}

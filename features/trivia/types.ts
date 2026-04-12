export interface TriviaQuestion {
  id: string
  question: string
  options: string[]
  correct_option: number
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

export interface TriviaSessionResult {
  total_questions: number
  correct_answers: number
  credits_earned: number
}

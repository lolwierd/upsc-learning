// ============================================
// Core Types
// ============================================

export type Subject =
  | "history"
  | "geography"
  | "polity"
  | "economy"
  | "science"
  | "environment"
  | "art_culture";

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionStyle =
  | "factual"
  | "conceptual"
  | "statement"
  | "match"
  | "assertion";

export type QuestionType = "standard" | "statement" | "match" | "assertion";

export type AttemptStatus = "in_progress" | "completed";

export type ModelProvider = "gemini" | "openai";

// ============================================
// Question Types
// ============================================

export interface BaseQuestion {
  id: string;
  sequenceNumber: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  explanation: string;
  metadata?: Record<string, unknown>;
}

export interface QuestionWithAnswer extends BaseQuestion {
  correctOption: number;
}

export interface QuestionForQuiz extends BaseQuestion {
  // correctOption is intentionally omitted
}

// Generated question from LLM (no ID yet)
export interface GeneratedQuestion {
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctOption: number;
  explanation: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Quiz Types
// ============================================

export interface Quiz {
  id: string;
  userId: string;
  subject: Subject;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  questionCount: number;
  modelUsed: ModelProvider;
  createdAt: number;
}

export interface QuizWithQuestions extends Quiz {
  questions: QuestionForQuiz[];
}

export interface QuizWithAnswers extends Quiz {
  questions: QuestionWithAnswer[];
}

// ============================================
// Attempt Types
// ============================================

export interface Attempt {
  id: string;
  quizId: string;
  userId: string;
  startedAt: number;
  submittedAt?: number;
  score?: number;
  totalQuestions: number;
  timeTakenSeconds?: number;
  status: AttemptStatus;
}

export interface AttemptAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOption: number | null;
  isCorrect?: boolean;
  markedForReview: boolean;
  answeredAt?: number;
}

export interface AttemptAnswerWithQuestion extends AttemptAnswer {
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctOption: number | null; // null until submitted
  explanation: string | null; // null until submitted
  sequenceNumber: number;
}

export interface AttemptWithAnswers extends Attempt {
  subject: Subject;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  answers: AttemptAnswerWithQuestion[];
}

// ============================================
// User Settings Types
// ============================================

export interface UserSettings {
  userId: string;
  defaultModel: ModelProvider;
  hasOpenaiKey: boolean;
  hasGeminiKey: boolean;
  defaultQuestionCount: number;
}

// ============================================
// API Response Types
// ============================================

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface QuizHistoryItem {
  id: string;
  subject: Subject;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  questionCount: number;
  createdAt: number;
  attemptId?: string;
  score?: number;
  attemptStatus?: AttemptStatus;
  submittedAt?: number;
}

export interface WrongAnswer {
  questionText: string;
  questionType: QuestionType;
  options: string[];
  selectedOption: number;
  correctOption: number;
  explanation: string;
  subject: Subject;
  theme?: string;
}

export interface OverallStats {
  totalAttempts: number;
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number;
}

export interface SubjectStats {
  subject: Subject;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
}

export interface UserStats {
  overall: OverallStats;
  bySubject: SubjectStats[];
}

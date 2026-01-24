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

// QuestionForQuiz is the same as BaseQuestion (correctOption is intentionally omitted)
export type QuestionForQuiz = BaseQuestion;

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
  status: "generating" | "completed" | "failed";
  error?: string;
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
  learnModeEnabled: boolean;
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
  status: "generating" | "completed" | "failed";
  error?: string;
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

// ============================================
// Quiz Set Types
// ============================================

export type QuizSetRunStatus = "running" | "completed" | "partial" | "failed";
export type QuizSetRunTriggerType = "manual" | "scheduled";
export type QuizSetRunItemStatus = "pending" | "generating" | "completed" | "failed";

export type QuestionEra =
  | "current"
  | "all"
  | "2024-2025"
  | "2021-2023"
  | "2018-2020"
  | "2014-2017"
  | "2011-2013";

export interface QuizSetItemConfig {
  subject: Subject;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  questionCount: number;
  era?: QuestionEra;
  enableCurrentAffairs?: boolean;
  currentAffairsTheme?: string;
}

export interface QuizSetItem extends QuizSetItemConfig {
  id: string;
  quizSetId: string;
  sequenceNumber: number;
  createdAt: number;
  updatedAt: number;
}

export interface QuizSet {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface QuizSetWithItems extends QuizSet {
  items: QuizSetItem[];
  itemCount: number;
}

export interface QuizSetSchedule {
  id: string;
  quizSetId: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  nextRunAt?: number;
  lastRunAt?: number;
  lastRunStatus?: QuizSetRunStatus;
  lastRunError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuizSetWithSchedule extends QuizSetWithItems {
  schedule?: QuizSetSchedule;
}

export interface QuizSetRun {
  id: string;
  quizSetId: string;
  scheduleId?: string;
  triggerType: QuizSetRunTriggerType;
  status: QuizSetRunStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface QuizSetRunItem {
  id: string;
  runId: string;
  quizSetItemId: string;
  quizId?: string;
  status: QuizSetRunItemStatus;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface QuizSetRunWithItems extends QuizSetRun {
  runItems: QuizSetRunItem[];
}

export interface QuizAttemptSummary {
  attemptId: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number | null;
  submittedAt: number;
}

export interface QuizSetListItem {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
  schedule?: {
    isEnabled: boolean;
    nextRunAt?: number;
    lastRunAt?: number;
    lastRunStatus?: QuizSetRunStatus;
  };
}

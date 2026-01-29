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
export interface QuizSetItemConfig {
  subject: Subject;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  questionCount: number;
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

// ============================================
// Run Attempt Types (Combined Quiz)
// ============================================

export type RunAttemptStatus = "in_progress" | "completed";

export interface RunAttempt {
  id: string;
  runId: string;
  startedAt: number;
  submittedAt?: number;
  score?: number;
  totalQuestions: number;
  timeTakenSeconds?: number;
  status: RunAttemptStatus;
  shuffleSeed: string;
}

export interface RunAttemptAnswer {
  id: string;
  runAttemptId: string;
  questionId: string;
  quizId: string;
  shuffledIndex: number;
  selectedOption: number | null;
  isCorrect?: boolean;
  markedForReview: boolean;
  answeredAt?: number;
}

export interface CombinedQuestion {
  id: string;
  quizId: string;
  subject: Subject;
  theme?: string;
  sequenceNumber: number;
  shuffledIndex: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctOption?: number; // Only included after submission or in learn mode
  explanation?: string; // Only included after submission or in learn mode
  metadata?: Record<string, unknown>;
}

export interface RunAttemptAnswerWithQuestion extends RunAttemptAnswer {
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctOption: number | null; // null until submitted
  explanation: string | null; // null until submitted
  subject: Subject;
  theme?: string;
  sequenceNumber: number;
}

export interface RunAttemptWithAnswers extends RunAttempt {
  quizSetName: string;
  answers: RunAttemptAnswerWithQuestion[];
}

export interface QuizScoreBreakdown {
  quizId: string;
  subject: Subject;
  theme?: string;
  score: number;
  totalQuestions: number;
  accuracy: number;
}

export interface SubjectScoreBreakdown {
  subject: Subject;
  score: number;
  totalQuestions: number;
  accuracy: number;
}

export interface RunAttemptResult {
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  accuracy: number;
  byQuiz: QuizScoreBreakdown[];
  bySubject: SubjectScoreBreakdown[];
}

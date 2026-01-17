import { z } from "zod";
import { SUBJECTS, DIFFICULTIES, QUESTION_STYLES, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from "./constants";

// ============================================
// Base Schemas
// ============================================

export const subjectSchema = z.enum(SUBJECTS);
export const difficultySchema = z.enum(DIFFICULTIES);
export const questionStyleSchema = z.enum(QUESTION_STYLES);
export const questionTypeSchema = z.enum(["standard", "statement", "match", "assertion"]);
export const attemptStatusSchema = z.enum(["in_progress", "completed"]);
export const modelProviderSchema = z.enum(["gemini", "openai"]);

// ============================================
// Request Schemas
// ============================================

export const generateQuizRequestSchema = z.object({
  subject: subjectSchema,
  theme: z.string().max(200).optional(),
  difficulty: difficultySchema,
  styles: z.array(questionStyleSchema).min(1, "Select at least one question style"),
  questionCount: z.number().int().min(MIN_QUESTION_COUNT).max(MAX_QUESTION_COUNT),
  turnstileToken: z.string().optional(), // Required in production
});

export const startAttemptRequestSchema = z.object({
  quizId: z.string(),
});

export const saveAnswerRequestSchema = z.object({
  questionId: z.string(),
  selectedOption: z.number().min(0).max(3).nullable(),
  markedForReview: z.boolean().optional(),
});

export const updateSettingsRequestSchema = z.object({
  defaultModel: modelProviderSchema.optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  defaultQuestionCount: z.number().int().min(MIN_QUESTION_COUNT).max(MAX_QUESTION_COUNT).optional(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  subject: subjectSchema.optional(),
});

// ============================================
// Response Schemas
// ============================================

export const questionForQuizSchema = z.object({
  id: z.string(),
  sequenceNumber: z.number(),
  questionText: z.string(),
  questionType: questionTypeSchema,
  options: z.array(z.string()).length(4),
  metadata: z.record(z.unknown()).optional(),
});

export const questionWithAnswerSchema = questionForQuizSchema.extend({
  correctOption: z.number().min(0).max(3),
  explanation: z.string(),
});

export const generatedQuestionSchema = z.object({
  questionText: z.string(),
  questionType: questionTypeSchema,
  options: z.array(z.string()).length(4),
  correctOption: z.number().min(0).max(3),
  explanation: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const quizResponseSchema = z.object({
  id: z.string(),
  subject: subjectSchema,
  theme: z.string().optional(),
  difficulty: difficultySchema,
  styles: z.array(questionStyleSchema),
  questionCount: z.number(),
  createdAt: z.number(),
  questions: z.array(questionForQuizSchema),
});

export const attemptAnswerWithQuestionSchema = z.object({
  questionId: z.string(),
  sequenceNumber: z.number(),
  questionText: z.string(),
  questionType: questionTypeSchema,
  options: z.array(z.string()).length(4),
  selectedOption: z.number().nullable(),
  correctOption: z.number().nullable(),
  isCorrect: z.boolean().nullable(),
  explanation: z.string().nullable(),
  markedForReview: z.boolean(),
});

export const attemptResponseSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  subject: subjectSchema,
  theme: z.string().optional(),
  difficulty: difficultySchema,
  styles: z.array(questionStyleSchema),
  status: attemptStatusSchema,
  score: z.number().nullable(),
  totalQuestions: z.number(),
  timeTakenSeconds: z.number().nullable(),
  startedAt: z.number(),
  submittedAt: z.number().nullable(),
  answers: z.array(attemptAnswerWithQuestionSchema),
});

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const quizHistoryItemSchema = z.object({
  id: z.string(),
  subject: subjectSchema,
  theme: z.string().optional(),
  difficulty: difficultySchema,
  styles: z.array(questionStyleSchema),
  questionCount: z.number(),
  createdAt: z.number(),
  attemptId: z.string().optional(),
  score: z.number().optional(),
  attemptStatus: attemptStatusSchema.optional(),
  submittedAt: z.number().optional(),
});

export const historyResponseSchema = z.object({
  quizzes: z.array(quizHistoryItemSchema),
  pagination: paginationSchema,
});

export const wrongAnswerSchema = z.object({
  questionText: z.string(),
  questionType: questionTypeSchema,
  options: z.array(z.string()).length(4),
  selectedOption: z.number(),
  correctOption: z.number(),
  explanation: z.string(),
  subject: subjectSchema,
  theme: z.string().optional(),
});

export const userStatsSchema = z.object({
  overall: z.object({
    totalAttempts: z.number(),
    totalQuestions: z.number(),
    totalCorrect: z.number(),
    accuracy: z.number(),
  }),
  bySubject: z.array(
    z.object({
      subject: subjectSchema,
      attempts: z.number(),
      correct: z.number(),
      total: z.number(),
      accuracy: z.number(),
    })
  ),
});

export const userSettingsSchema = z.object({
  defaultModel: modelProviderSchema,
  hasOpenaiKey: z.boolean(),
  hasGeminiKey: z.boolean(),
  defaultQuestionCount: z.number(),
});

// ============================================
// Type Inference
// ============================================

export type GenerateQuizRequest = z.infer<typeof generateQuizRequestSchema>;
export type StartAttemptRequest = z.infer<typeof startAttemptRequestSchema>;
export type SaveAnswerRequest = z.infer<typeof saveAnswerRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

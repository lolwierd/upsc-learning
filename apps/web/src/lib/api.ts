import type {
  GenerateQuizRequest,
  QuizWithQuestions,
  AttemptWithAnswers,
  QuizHistoryItem,
  PaginationInfo,
  WrongAnswer,
  UserStats,
  UserSettings,
} from "@mcqs/shared";
import { API_ENDPOINTS } from "@mcqs/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Quiz APIs
export async function generateQuiz(
  data: GenerateQuizRequest
): Promise<{ quizId: string; questionCount: number }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_GENERATE, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getQuiz(id: string, options?: { withAnswers?: boolean }): Promise<QuizWithQuestions & { learnMode?: boolean }> {
  const query = options?.withAnswers ? "?withAnswers=true" : "";
  return fetchAPI(`${API_ENDPOINTS.QUIZ_GET(id)}${query}`);
}

// Attempt APIs
export async function startAttempt(
  quizId: string
): Promise<{ attemptId: string; message?: string }> {
  return fetchAPI(API_ENDPOINTS.ATTEMPT_START, {
    method: "POST",
    body: JSON.stringify({ quizId }),
  });
}

export async function saveAnswer(
  attemptId: string,
  data: {
    questionId: string;
    selectedOption: number | null;
    markedForReview?: boolean;
  }
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.ATTEMPT_ANSWER(attemptId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function submitAttempt(
  attemptId: string
): Promise<{ score: number; totalQuestions: number; timeTakenSeconds: number }> {
  return fetchAPI(API_ENDPOINTS.ATTEMPT_SUBMIT(attemptId), {
    method: "POST",
  });
}

export async function getAttempt(id: string): Promise<AttemptWithAnswers> {
  return fetchAPI(API_ENDPOINTS.ATTEMPT_GET(id));
}

// History APIs
export async function getHistory(params?: {
  page?: number;
  limit?: number;
  subject?: string;
}): Promise<{ quizzes: QuizHistoryItem[]; pagination: PaginationInfo }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.subject) searchParams.set("subject", params.subject);

  const query = searchParams.toString();
  return fetchAPI(`${API_ENDPOINTS.HISTORY}${query ? `?${query}` : ""}`);
}

export async function getWrongAnswers(
  subject?: string
): Promise<{ wrongAnswers: WrongAnswer[] }> {
  const query = subject ? `?subject=${subject}` : "";
  return fetchAPI(`${API_ENDPOINTS.REVIEW_WRONG}${query}`);
}

export async function getStats(): Promise<UserStats> {
  return fetchAPI(API_ENDPOINTS.STATS);
}

export type AiMetricStatus = "success" | "error";

export interface AiGenerationMetric {
  id: string;
  quizId: string | null;
  userId: string;
  provider: "gemini" | "openai";
  model: string;
  factCheckModel?: string | null;
  subject: string;
  theme: string | null;
  difficulty: string;
  styles: unknown;
  era: string | null;
  status: AiMetricStatus;
  errorMessage: string | null;
  requestedCount: number;
  returnedCount: number;
  dedupEnabled: boolean;
  dedupFilteredCount: number;
  validationIsValid: boolean | null;
  validationInvalidCount: number | null;
  validationErrorCount: number | null;
  validationWarningCount: number | null;
  validationBatchWarnings: unknown;
  parseStrategy: "direct" | "extracted" | null;
  promptChars: number | null;
  responseChars: number | null;
  totalDurationMs: number | null;
  generationDurationMs: number | null;
  factCheckEnabled: boolean;
  factCheckDurationMs: number | null;
  factCheckCheckedCount: number | null;
  factCheckIssueCount: number | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  createdAt: number;
}

export async function getAiMetrics(params?: {
  limit?: number;
  subject?: string;
  status?: AiMetricStatus;
}): Promise<{ metrics: AiGenerationMetric[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.subject) searchParams.set("subject", params.subject);
  if (params?.status) searchParams.set("status", params.status);

  const query = searchParams.toString();
  return fetchAPI(`/api/metrics/ai${query ? `?${query}` : ""}`);
}

// Settings APIs
export async function getSettings(): Promise<UserSettings> {
  return fetchAPI(API_ENDPOINTS.SETTINGS);
}

export async function updateSettings(
  data: Partial<{
    defaultModel: "gemini" | "openai";
    openaiApiKey: string;
    geminiApiKey: string;
    defaultQuestionCount: number;
    learnModeEnabled: boolean;
  }>
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.SETTINGS, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function resetApiKey(
  keyType: "openai" | "gemini"
): Promise<{ success: boolean }> {
  return fetchAPI(`${API_ENDPOINTS.SETTINGS}/key/${keyType}`, {
    method: "DELETE",
  });
}

// Activity API for contribution graph
export async function getActivity(
  days?: number
): Promise<{ activity: Array<{ date: string; attempts: number; correct: number; total: number; accuracy: number }> }> {
  const query = days ? `?days=${days}` : "";
  return fetchAPI(`${API_ENDPOINTS.HISTORY}/activity${query}`);
}

// Timeline stats API
export interface TimelineQuiz {
  attemptId: string;
  quizId: string;
  subject: string;
  theme?: string;
  difficulty: string;
  styles: string[];
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  submittedAt: number;
}

export interface TimelineDay {
  date: string;
  quizzes: TimelineQuiz[];
  totalScore: number;
  totalQuestions: number;
}

export async function getStatsTimeline(
  limit?: number
): Promise<{ timeline: TimelineDay[] }> {
  const query = limit ? `?limit=${limit}` : "";
  return fetchAPI(`${API_ENDPOINTS.STATS}/timeline${query}`);
}

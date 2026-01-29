import type {
  GenerateQuizRequest,
  QuizWithQuestions,
  AttemptWithAnswers,
  QuizHistoryItem,
  PaginationInfo,
  WrongAnswer,
  UserStats,
  UserSettings,
  QuizSetListItem,
  QuizSetWithSchedule,
  QuizSetItem,
  QuizSetSchedule,
  QuizSetRun,
  QuizSetRunWithItems,
  QuizSetItemConfig,
  CreateQuizSetRequest,
  UpdateQuizSetRequest,
  QuizSetScheduleRequest,
  QuizAttemptSummary,
  CombinedQuestion,
  RunAttemptWithAnswers,
  RunAttemptResult,
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

export async function getAttemptsByQuizIds(
  quizIds: string[]
): Promise<{ attempts: QuizAttemptSummary[] }> {
  const query = quizIds.length > 0 ? `?ids=${quizIds.join(",")}` : "";
  return fetchAPI(`${API_ENDPOINTS.ATTEMPT_BY_QUIZ}${query}`);
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
  provider: "gemini" | "openai";
  model: string;
  factCheckModel?: string | null;
  subject: string;
  theme: string | null;
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
  groundingEnabled: boolean;
  groundingSourceCount: number | null;
  requestPrompt: string | null;
  rawResponse: string | null;
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
    openaiApiKey: string;
    geminiApiKey: string;
    defaultQuestionCount: number;
    learnModeEnabled: boolean;
    defaultQuizSetId: string | null;
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

// ============================================
// Quiz Sets APIs
// ============================================

// Get all quiz sets
export async function getQuizSets(): Promise<{ sets: QuizSetListItem[] }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SETS);
}

// Create a new quiz set
export async function createQuizSet(
  data: CreateQuizSetRequest
): Promise<QuizSetWithSchedule> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SETS, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Get a single quiz set with items and schedule
export async function getQuizSet(id: string): Promise<QuizSetWithSchedule> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_GET(id));
}

// Update quiz set metadata
export async function updateQuizSet(
  id: string,
  data: UpdateQuizSetRequest
): Promise<QuizSetWithSchedule> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_GET(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Delete a quiz set
export async function deleteQuizSet(id: string): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_GET(id), {
    method: "DELETE",
  });
}

// ============================================
// Quiz Set Items APIs
// ============================================

// Add item to quiz set
export async function addQuizSetItem(
  setId: string,
  item: QuizSetItemConfig
): Promise<QuizSetItem> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_ITEMS(setId), {
    method: "POST",
    body: JSON.stringify(item),
  });
}

// Update quiz set item
export async function updateQuizSetItem(
  setId: string,
  itemId: string,
  item: Partial<QuizSetItemConfig>
): Promise<QuizSetItem> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_ITEM(setId, itemId), {
    method: "PATCH",
    body: JSON.stringify(item),
  });
}

// Delete quiz set item
export async function deleteQuizSetItem(
  setId: string,
  itemId: string
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_ITEM(setId, itemId), {
    method: "DELETE",
  });
}

// Reorder quiz set items
export async function reorderQuizSetItems(
  setId: string,
  itemIds: string[]
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_ITEMS_REORDER(setId), {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

// ============================================
// Quiz Set Generation APIs
// ============================================

// Start quiz set generation
export async function generateQuizSet(
  setId: string
): Promise<{ runId: string; status: string }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_GENERATE(setId), {
    method: "POST",
  });
}

// Get generation runs for a quiz set
export async function getQuizSetRuns(
  setId: string
): Promise<{ runs: QuizSetRun[] }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_RUNS(setId));
}

// Get a specific run with items
export async function getQuizSetRun(
  setId: string,
  runId: string
): Promise<QuizSetRunWithItems> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_RUN(setId, runId));
}

// ============================================
// Quiz Set Schedule APIs
// ============================================

// Get schedule for a quiz set
export async function getQuizSetSchedule(
  setId: string
): Promise<{ schedule: QuizSetSchedule | null }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_SCHEDULE(setId));
}

// Create or update schedule
export async function setQuizSetSchedule(
  setId: string,
  schedule: QuizSetScheduleRequest
): Promise<{ schedule: QuizSetSchedule }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_SCHEDULE(setId), {
    method: "PUT",
    body: JSON.stringify(schedule),
  });
}

// Delete schedule
export async function deleteQuizSetSchedule(
  setId: string
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_SCHEDULE(setId), {
    method: "DELETE",
  });
}

// Toggle schedule enabled/disabled
export async function toggleQuizSetSchedule(
  setId: string,
  isEnabled: boolean
): Promise<{ schedule: QuizSetSchedule }> {
  return fetchAPI(API_ENDPOINTS.QUIZ_SET_SCHEDULE_TOGGLE(setId), {
    method: "POST",
    body: JSON.stringify({ isEnabled }),
  });
}

// ============================================
// Run Attempt APIs (Combined Quiz)
// ============================================

// Get all questions from a run, shuffled
export async function getCombinedQuestions(
  setId: string,
  runId: string
): Promise<{ questions: CombinedQuestion[]; totalQuestions: number; learnMode: boolean }> {
  return fetchAPI(API_ENDPOINTS.RUN_COMBINED_QUESTIONS(setId, runId));
}

// Start or resume a run attempt
export async function startRunAttempt(
  setId: string,
  runId: string
): Promise<{ attemptId: string; status: string; message?: string; totalQuestions?: number }> {
  return fetchAPI(API_ENDPOINTS.RUN_ATTEMPT_START(setId, runId), {
    method: "POST",
  });
}

// Get run attempt with answers
export async function getRunAttempt(id: string): Promise<RunAttemptWithAnswers> {
  return fetchAPI(API_ENDPOINTS.RUN_ATTEMPT_GET(id));
}

// Save an answer for run attempt
export async function saveRunAttemptAnswer(
  runAttemptId: string,
  data: {
    questionId: string;
    selectedOption: number | null;
    markedForReview?: boolean;
  }
): Promise<{ success: boolean }> {
  return fetchAPI(API_ENDPOINTS.RUN_ATTEMPT_ANSWER(runAttemptId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Submit run attempt and get results
export async function submitRunAttempt(runAttemptId: string): Promise<RunAttemptResult> {
  return fetchAPI(API_ENDPOINTS.RUN_ATTEMPT_SUBMIT(runAttemptId), {
    method: "POST",
  });
}

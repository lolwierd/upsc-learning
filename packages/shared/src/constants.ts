// ============================================
// Subject Constants
// ============================================

export const SUBJECTS = [
  "history",
  "geography",
  "polity",
  "economy",
  "science",
  "environment",
  "art_culture",
] as const;

export const SUBJECT_LABELS: Record<(typeof SUBJECTS)[number], string> = {
  history: "History",
  geography: "Geography",
  polity: "Indian Polity",
  economy: "Economy",
  science: "Science & Technology",
  environment: "Environment & Ecology",
  art_culture: "Art & Culture",
};

export const SUBJECT_DESCRIPTIONS: Record<(typeof SUBJECTS)[number], string> = {
  history: "Ancient, Medieval, and Modern Indian History",
  geography: "Physical, Indian, and World Geography",
  polity: "Constitution, Governance, and Political System",
  economy: "Indian Economy, Development, and Economic Concepts",
  science: "General Science, Technology, and Recent Developments",
  environment: "Ecology, Biodiversity, and Environmental Issues",
  art_culture: "Indian Art, Architecture, and Cultural Heritage",
};

// ============================================
// Difficulty Constants
// ============================================

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const DIFFICULTY_LABELS: Record<(typeof DIFFICULTIES)[number], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_DESCRIPTIONS: Record<(typeof DIFFICULTIES)[number], string> = {
  easy: "Basic facts and fundamental concepts",
  medium: "Application-based questions with plausible distractors",
  hard: "Deep analytical thinking, similar to actual UPSC prelims",
};

// ============================================
// Question Style Constants
// ============================================

export const QUESTION_STYLES = [
  "factual",
  "conceptual",
  "statement",
  "match",
  "assertion",
] as const;

export const QUESTION_STYLE_LABELS: Record<(typeof QUESTION_STYLES)[number], string> = {
  factual: "Factual",
  conceptual: "Conceptual",
  statement: "Statement I & II",
  match: "Match the Following",
  assertion: "Assertion-Reason",
};

export const QUESTION_STYLE_DESCRIPTIONS: Record<(typeof QUESTION_STYLES)[number], string> = {
  factual: "Direct questions testing specific facts and information",
  conceptual: "Questions testing understanding of principles and concepts",
  statement: "Evaluate if Statement I and Statement II are correct",
  match: "Match items from Column A with Column B",
  assertion: "Evaluate relationship between Assertion (A) and Reason (R)",
};

// ============================================
// Question Count Options
// ============================================

export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 500;
export const DEFAULT_QUESTION_COUNT = 10;

// Legacy - for backwards compatibility
export const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30] as const;

// ============================================
// Model Provider Constants
// ============================================

export const MODEL_PROVIDERS = ["gemini", "openai"] as const;

export const MODEL_PROVIDER_LABELS: Record<(typeof MODEL_PROVIDERS)[number], string> = {
  gemini: "Google Gemini (Default)",
  openai: "OpenAI GPT-4 (BYOK)",
};

// ============================================
// Rate Limits
// ============================================

export const RATE_LIMITS = {
  QUIZ_GENERATION: {
    limit: 5,
    windowSeconds: 60,
  },
} as const;

// ============================================
// API Endpoints (for frontend use)
// ============================================

export const API_ENDPOINTS = {
  QUIZ_GENERATE: "/api/quiz/generate",
  QUIZ_GET: (id: string) => `/api/quiz/${id}`,
  ATTEMPT_START: "/api/attempt/start",
  ATTEMPT_ANSWER: (id: string) => `/api/attempt/${id}/answer`,
  ATTEMPT_SUBMIT: (id: string) => `/api/attempt/${id}/submit`,
  ATTEMPT_GET: (id: string) => `/api/attempt/${id}`,
  HISTORY: "/api/history",
  REVIEW_WRONG: "/api/history/review/wrong",
  STATS: "/api/history/stats",
  SETTINGS: "/api/settings",
} as const;

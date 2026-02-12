// Database interface that works with both D1 (Cloudflare) and better-sqlite3 (Node.js)
// The actual implementation is chosen at runtime based on the environment
export interface DatabaseLikeStatement {
  bind(...values: unknown[]): DatabaseLikeStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes: number; last_row_id: number } }>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
}

export interface DatabaseLike {
  prepare(sql: string): DatabaseLikeStatement;
}

export interface Env {
  DB: DatabaseLike | D1Database;
  AI?: Ai; // Optional - not used in Node.js version
  GCP_SERVICE_ACCOUNT: string; // JSON string of service account key (REQUIRED)
  GOOGLE_VERTEX_LOCATION?: string; // GCP region for Vertex AI, e.g. us-central1 or global
  CORS_ORIGIN?: string;
  ENVIRONMENT?: string;
  ENABLE_FACT_CHECK?: string; // "1" to enable by default
  LLM_DEBUG?: string; // "1" for verbose logs
  LOCAL_LLM_DUMP_URL?: string; // e.g. http://127.0.0.1:8790/dump (local dev only)
  GENERATION_MODEL?: string; // e.g. gemini-3-pro-preview (default)
  FACT_CHECK_MODEL?: string; // e.g. gemini-3-flash-preview (default)
  ENABLE_WEB_GROUNDING?: string; // "1" to enable Google Search grounding for current affairs
  LLM_DUMP?: string; // "1" to enable dumping even in production
  LLM_MAX_RETRIES?: string; // Max retry attempts for LLM calls (default: 3)
  LLM_RETRY_DELAY_MS?: string; // Base delay for exponential backoff in ms (default: 2000)
  REGENERATION_MAX_ATTEMPTS?: string; // Max regeneration cycles to recover filtered shortfalls
  REGENERATION_EMERGENCY_ATTEMPTS?: string; // Additional no-dedupe regeneration attempts
  NOTIFICATION_WEB_BASE_URL?: string; // Public web URL used in notifier links
  NOTIFICATION_API_BASE_URL?: string; // Public API URL used in notifier links
  NOTIFICATION_DISCORD_USERNAME?: string; // Optional Discord webhook username override

  // Dedupe tuning knobs (optional)
  DEDUP_HISTORY_LIMIT?: string; // default: 600
  DEDUP_CLUSTER_LIMIT?: string; // default: 600
  DEDUP_HISTORY_SIM_THRESHOLD?: string; // default: 0.62
  DEDUP_INTRA_CONFIRM_THRESHOLD?: string; // default: 0.50
  DEDUP_HISTORY_CONFIRM_THRESHOLD?: string; // default: 0.50
}

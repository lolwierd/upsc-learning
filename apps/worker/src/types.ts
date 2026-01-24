// Database interface that works with both D1 (Cloudflare) and better-sqlite3 (Node.js)
// The actual implementation is chosen at runtime based on the environment
export interface DatabaseLike {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(columnName?: string): Promise<T | null>;
      run(): Promise<{ success: boolean; meta?: { changes: number; last_row_id: number } }>;
      all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
    };
  };
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
}

// User context from Cloudflare Access
export interface UserContext {
  userId: string;
  email?: string;
}


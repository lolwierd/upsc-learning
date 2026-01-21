export interface Env {
  DB: D1Database;
  AI: Ai;
  GOOGLE_API_KEY: string;
  GCP_SERVICE_ACCOUNT?: string; // JSON string of service account key
  GOOGLE_VERTEX_LOCATION?: string; // GCP region for Vertex AI, e.g. us-central1
  CORS_ORIGIN?: string;
  ENVIRONMENT?: string;
  ENABLE_FACT_CHECK?: string; // "1" to enable by default
  LLM_DEBUG?: string; // "1" for verbose logs
  LOCAL_LLM_DUMP_URL?: string; // e.g. http://127.0.0.1:8790/dump (local dev only)
  GENERATION_MODEL?: string; // e.g. gemini-3-pro-preview (default)
  FACT_CHECK_MODEL?: string; // e.g. gemini-3-flash-preview (default)
  ENABLE_WEB_GROUNDING?: string; // "1" to enable Google Search grounding for current affairs
}

// User context from Cloudflare Access
export interface UserContext {
  userId: string;
  email?: string;
}

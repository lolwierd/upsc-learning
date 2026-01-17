export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace
  CACHE: KVNamespace;

  // Workers AI
  AI: Ai;

  // Environment variables
  ENVIRONMENT: string;
  CORS_ORIGIN: string;
  TURNSTILE_SECRET_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
}

// User context from Cloudflare Access
export interface UserContext {
  userId: string;
  email?: string;
}

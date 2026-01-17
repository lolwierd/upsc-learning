export interface Env {
  DB: D1Database;
  AI: any;
  GOOGLE_API_KEY: string;
}

// User context from Cloudflare Access
export interface UserContext {
  userId: string;
  email?: string;
}

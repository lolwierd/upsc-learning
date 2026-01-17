import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

export const verifyTurnstile = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    // Skip in development
    if (c.env.ENVIRONMENT === "development") {
      return next();
    }

    const body = await c.req.json();
    const turnstileToken = body.turnstileToken;

    if (!turnstileToken) {
      return c.json({ error: "Turnstile token required" }, 400);
    }

    if (!c.env.TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY not configured");
      return c.json({ error: "Server configuration error" }, 500);
    }

    const formData = new FormData();
    formData.append("secret", c.env.TURNSTILE_SECRET_KEY);
    formData.append("response", turnstileToken);
    formData.append("remoteip", c.req.header("CF-Connecting-IP") || "");

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      }
    );

    const result: TurnstileResponse = await response.json();

    if (!result.success) {
      console.error("Turnstile verification failed:", result["error-codes"]);
      return c.json({ error: "Bot verification failed" }, 403);
    }

    return next();
  }
);

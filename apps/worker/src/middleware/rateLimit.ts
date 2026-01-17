import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

interface RateLimitOptions {
  limit: number; // Max requests
  window: number; // Time window in seconds
}

export const rateLimit = ({ limit, window }: RateLimitOptions) => {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const userId =
      c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
    const endpoint = c.req.path;
    const key = `ratelimit:${userId}:${endpoint}`;

    // Get current count from KV
    const current = await c.env.CACHE.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      return c.json(
        {
          error: "Rate limit exceeded",
          retryAfter: window,
        },
        429
      );
    }

    // Increment count
    await c.env.CACHE.put(key, String(count + 1), {
      expirationTtl: window,
    });

    // Add rate limit headers
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - count - 1));

    return next();
  });
};

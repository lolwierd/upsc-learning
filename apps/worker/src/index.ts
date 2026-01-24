import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { quizRoutes } from "./routes/quiz.js";
import { attemptRoutes } from "./routes/attempt.js";
import { historyRoutes } from "./routes/history.js";
import { settingsRoutes } from "./routes/settings.js";
import { metricsRoutes } from "./routes/metrics.js";
import type { Env } from "./types.js";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowedOrigins = (c.env.CORS_ORIGIN || "http://localhost:3000").split(",");
      
      for (const allowed of allowedOrigins) {
        const trimmed = allowed.trim();
        // Handle wildcard (e.g., *.pages.dev)
        if (trimmed.startsWith("*")) {
          const suffix = trimmed.slice(1);
          if (origin.endsWith(suffix)) return origin;
        } 
        // Handle exact match
        else if (origin === trimmed) {
          return origin;
        }
      }
      
      return allowedOrigins[0]; // Fallback to first allowed origin
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", service: "upsc-mcq-api" });
});

// API Routes
app.route("/api/quiz", quizRoutes);
app.route("/api/attempt", attemptRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/metrics", metricsRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    { error: "Internal Server Error", message: err.message },
    500
  );
});

export default app;

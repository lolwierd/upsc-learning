import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { quizRoutes } from "./routes/quiz";
import { attemptRoutes } from "./routes/attempt";
import { historyRoutes } from "./routes/history";
import { settingsRoutes } from "./routes/settings";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowedOrigin = c.env.CORS_ORIGIN || "http://localhost:3000";
      return origin === allowedOrigin ? origin : allowedOrigin;
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

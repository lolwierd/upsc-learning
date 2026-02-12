import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../types.js";
import {
  listAiGenerationMetrics,
  getAiGenerationMetricById,
  type AiMetricStatus,
} from "../services/ai-metrics.js";

const metrics = new Hono<{ Bindings: Env }>();

const aiMetricsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  subject: z.string().optional(),
  status: z.enum(["success", "error"]).optional(),
});

metrics.get("/ai", zValidator("query", aiMetricsQuerySchema), async (c) => {
  const { limit, subject, status } = c.req.valid("query");

  try {
    const rows = await listAiGenerationMetrics(c.env.DB, {
      limit,
      subject,
      status: status as AiMetricStatus | undefined,
    });

    return c.json({ metrics: rows });
  } catch (error) {
    console.error("Failed to load AI metrics:", error);
    return c.json(
      {
        error: "Failed to load AI metrics",
        hint: "Ensure D1 migrations are applied (pnpm db:migrate).",
      },
      500
    );
  }
});

metrics.get("/ai/:id/prompt", async (c) => {
  const metricId = c.req.param("id");
  const metric = await getAiGenerationMetricById(c.env.DB, metricId);
  if (!metric) {
    return c.json({ error: "Metric not found" }, 404);
  }
  if (!metric.requestPrompt) {
    return c.json({ error: "Prompt not available for this metric" }, 404);
  }
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.text(metric.requestPrompt);
});

metrics.get("/ai/:id/response", async (c) => {
  const metricId = c.req.param("id");
  const metric = await getAiGenerationMetricById(c.env.DB, metricId);
  if (!metric) {
    return c.json({ error: "Metric not found" }, 404);
  }
  if (!metric.rawResponse) {
    return c.json({ error: "Raw response not available for this metric" }, 404);
  }
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.text(metric.rawResponse);
});

export { metrics as metricsRoutes };

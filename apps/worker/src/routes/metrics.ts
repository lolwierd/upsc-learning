import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../types.js";
import {
  listAiGenerationMetricsByUser,
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
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  try {
    const rows = await listAiGenerationMetricsByUser(c.env.DB, {
      userId,
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

export { metrics as metricsRoutes };

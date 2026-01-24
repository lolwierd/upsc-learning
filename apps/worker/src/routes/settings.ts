import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../types";
import { MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from "@mcqs/shared";

const settings = new Hono<{ Bindings: Env }>();

type UserSettingsRow = {
  default_model: string | null;
  openai_api_key: string | null;
  gemini_api_key: string | null;
  default_question_count: number | null;
  learn_mode_enabled: number | null;
};

const updateSettingsSchema = z.object({
  defaultModel: z.enum(["gemini", "openai"]).optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  defaultQuestionCount: z.number().int().min(MIN_QUESTION_COUNT).max(MAX_QUESTION_COUNT).optional(),
  learnModeEnabled: z.boolean().optional(),
});

// Get user settings
settings.get("/", async (c) => {
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  const result = await c.env.DB.prepare(
    `SELECT * FROM user_settings WHERE user_id = ?`
  )
    .bind(userId)
    .first<UserSettingsRow>();

  if (!result) {
    // Return defaults
    return c.json({
      defaultModel: "gemini",
      hasOpenaiKey: false,
      hasGeminiKey: false,
      defaultQuestionCount: 10,
      learnModeEnabled: false,
    });
  }

  return c.json({
    defaultModel: result.default_model || "gemini",
    hasOpenaiKey: !!result.openai_api_key,
    hasGeminiKey: !!result.gemini_api_key,
    defaultQuestionCount: result.default_question_count || 10,
    learnModeEnabled: !!result.learn_mode_enabled,
  });
});

// Update user settings
settings.patch("/", zValidator("json", updateSettingsSchema), async (c) => {
  const body = c.req.valid("json");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const now = Math.floor(Date.now() / 1000);

  // Check if settings exist
  const existing = await c.env.DB.prepare(
    `SELECT * FROM user_settings WHERE user_id = ?`
  )
    .bind(userId)
    .first();

  if (!existing) {
    // Create new settings
    await c.env.DB.prepare(
      `INSERT INTO user_settings (user_id, default_model, openai_api_key, gemini_api_key, default_question_count, learn_mode_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        userId,
        body.defaultModel || "gemini",
        body.openaiApiKey || null,
        body.geminiApiKey || null,
        body.defaultQuestionCount || 10,
        body.learnModeEnabled ? 1 : 0,
        now,
        now
      )
      .run();
  } else {
    // Update existing settings
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.defaultModel !== undefined) {
      updates.push("default_model = ?");
      params.push(body.defaultModel);
    }
    if (body.openaiApiKey !== undefined) {
      updates.push("openai_api_key = ?");
      params.push(body.openaiApiKey || null);
    }
    if (body.geminiApiKey !== undefined) {
      updates.push("gemini_api_key = ?");
      params.push(body.geminiApiKey || null);
    }
    if (body.defaultQuestionCount !== undefined) {
      updates.push("default_question_count = ?");
      params.push(body.defaultQuestionCount);
    }
    if (body.learnModeEnabled !== undefined) {
      updates.push("learn_mode_enabled = ?");
      params.push(body.learnModeEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(now);
      params.push(userId);

      await c.env.DB.prepare(
        `UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = ?`
      )
        .bind(...params)
        .run();
    }
  }

  return c.json({ success: true });
});

// Reset API key (delete user's saved key, revert to default)
settings.delete("/key/:type", async (c) => {
  const keyType = c.req.param("type");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const now = Math.floor(Date.now() / 1000);

  if (keyType !== "openai" && keyType !== "gemini") {
    return c.json({ error: "Invalid key type" }, 400);
  }

  const column = keyType === "openai" ? "openai_api_key" : "gemini_api_key";

  await c.env.DB.prepare(
    `UPDATE user_settings SET ${column} = NULL, updated_at = ? WHERE user_id = ?`
  )
    .bind(now, userId)
    .run();

  return c.json({ success: true });
});

export { settings as settingsRoutes };

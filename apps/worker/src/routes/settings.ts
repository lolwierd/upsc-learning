import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../types.js";
import { MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from "@mcqs/shared";

const settings = new Hono<{ Bindings: Env }>();

type UserSettingsRow = {
  openai_api_key: string | null;
  gemini_api_key: string | null;
  default_question_count: number | null;
  learn_mode_enabled: number | null;
  default_quiz_set_id: string | null;
};

const updateSettingsSchema = z.object({
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  defaultQuestionCount: z.number().int().min(MIN_QUESTION_COUNT).max(MAX_QUESTION_COUNT).optional(),
  learnModeEnabled: z.boolean().optional(),
  defaultQuizSetId: z.string().nullable().optional(),
});

// Get user settings
settings.get("/", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT * FROM user_settings ORDER BY updated_at DESC LIMIT 1`
  )
    .bind()
    .first<UserSettingsRow>();

  if (!result) {
    // Return defaults
    return c.json({
      hasOpenaiKey: false,
      hasGeminiKey: false,
      defaultQuestionCount: 10,
      learnModeEnabled: false,
      defaultQuizSetId: null,
    });
  }

  return c.json({
    hasOpenaiKey: !!result.openai_api_key,
    hasGeminiKey: !!result.gemini_api_key,
    defaultQuestionCount: result.default_question_count || 10,
    learnModeEnabled: !!result.learn_mode_enabled,
    defaultQuizSetId: result.default_quiz_set_id || null,
  });
});

// Update user settings
settings.patch("/", zValidator("json", updateSettingsSchema), async (c) => {
  const body = c.req.valid("json");
  const now = Math.floor(Date.now() / 1000);

  // Check if settings exist
  const existing = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM user_settings`
  )
    .bind()
    .first<{ total: number }>();

  if (!existing || existing.total === 0) {
    // Create new settings
    const defaultQuizSetId = body.defaultQuizSetId ? body.defaultQuizSetId : null;

    await c.env.DB.prepare(
      `INSERT INTO user_settings (user_id, openai_api_key, gemini_api_key, default_question_count, learn_mode_enabled, default_quiz_set_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        "public",
        body.openaiApiKey || null,
        body.geminiApiKey || null,
        body.defaultQuestionCount || 10,
        body.learnModeEnabled ? 1 : 0,
        defaultQuizSetId,
        now,
        now
      )
      .run();
  } else {
    // Update existing settings
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

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
    if (body.defaultQuizSetId !== undefined) {
      updates.push("default_quiz_set_id = ?");
      params.push(body.defaultQuizSetId ? body.defaultQuizSetId : null);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(now);

      await c.env.DB.prepare(
        `UPDATE user_settings SET ${updates.join(", ")}`
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
  const now = Math.floor(Date.now() / 1000);

  if (keyType !== "openai" && keyType !== "gemini") {
    return c.json({ error: "Invalid key type" }, 400);
  }

  const column = keyType === "openai" ? "openai_api_key" : "gemini_api_key";

  await c.env.DB.prepare(
    `UPDATE user_settings SET ${column} = NULL, updated_at = ?`
  )
    .bind(now)
    .run();

  return c.json({ success: true });
});

export { settings as settingsRoutes };

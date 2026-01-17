import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import type { Env } from "../types";
import { generateQuizRequestSchema } from "@mcqs/shared";
import { generateQuiz } from "../services/llm";

const quiz = new Hono<{ Bindings: Env }>();

// Generate a new quiz
quiz.post(
  "/generate",
  zValidator("json", generateQuizRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

    try {
      // Get user settings for API key
      const settings = await c.env.DB.prepare(
        `SELECT gemini_api_key FROM user_settings WHERE user_id = ?`
      )
        .bind(userId)
        .first();

      const geminiApiKey = (settings?.gemini_api_key as string) || c.env.GOOGLE_API_KEY;

      // Generate questions using LLM
      const questions = await generateQuiz(c.env, {
        subject: body.subject,
        theme: body.theme,
        difficulty: body.difficulty,
        styles: body.styles,
        count: body.questionCount,
        apiKey: geminiApiKey,
      });

      // Create quiz in database
      const quizId = nanoid();
      const now = Math.floor(Date.now() / 1000);

      // Store styles as JSON string
      const stylesJson = JSON.stringify(body.styles);

      await c.env.DB.prepare(
        `INSERT INTO quizzes (id, user_id, subject, theme, difficulty, style, question_count, model_used, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          quizId,
          userId,
          body.subject,
          body.theme || null,
          body.difficulty,
          stylesJson,
          body.questionCount,
          "gemini",
          now
        )
        .run();

      // Insert questions
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const questionId = nanoid();
        await c.env.DB.prepare(
          `INSERT INTO questions (id, quiz_id, sequence_number, question_text, question_type, options, correct_option, explanation, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            questionId,
            quizId,
            i + 1,
            q.questionText,
            q.questionType,
            JSON.stringify(q.options),
            q.correctOption,
            q.explanation,
            q.metadata ? JSON.stringify(q.metadata) : null,
            now
          )
          .run();
      }

      return c.json({ quizId, questionCount: questions.length });
    } catch (error) {
      console.error("Quiz generation error:", error);
      return c.json({ error: "Failed to generate quiz" }, 500);
    }
  }
);

// Helper to parse styles from DB (handles both old string and new JSON format)
function parseStyles(styleData: unknown): string[] {
  if (typeof styleData === "string") {
    // Try parsing as JSON array first
    try {
      const parsed = JSON.parse(styleData);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, treat as single style (backwards compatibility)
      return [styleData];
    }
  }
  return ["factual"]; // Default fallback
}

// Get quiz by ID
quiz.get("/:id", async (c) => {
  const quizId = c.req.param("id");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const withAnswers = c.req.query("withAnswers") === "true";

  // Check if user has learn mode enabled (only if withAnswers is requested)
  let learnModeEnabled = false;
  if (withAnswers) {
    const settingsResult = await c.env.DB.prepare(
      `SELECT learn_mode_enabled FROM user_settings WHERE user_id = ?`
    )
      .bind(userId)
      .first();
    learnModeEnabled = !!settingsResult?.learn_mode_enabled;
  }

  // Get quiz
  const quizResult = await c.env.DB.prepare(
    `SELECT * FROM quizzes WHERE id = ? AND user_id = ?`
  )
    .bind(quizId, userId)
    .first();

  if (!quizResult) {
    return c.json({ error: "Quiz not found" }, 404);
  }

  // Get questions
  const questionsResult = await c.env.DB.prepare(
    `SELECT * FROM questions WHERE quiz_id = ? ORDER BY sequence_number ASC`
  )
    .bind(quizId)
    .all();

  const includeAnswers = withAnswers && learnModeEnabled;

  const questions = questionsResult.results.map((q: Record<string, unknown>) => ({
    id: q.id,
    sequenceNumber: q.sequence_number,
    questionText: q.question_text,
    questionType: q.question_type,
    options: JSON.parse(q.options as string),
    metadata: q.metadata ? JSON.parse(q.metadata as string) : null,
    // Include correct answer and explanation only in learn mode
    ...(includeAnswers && {
      correctOption: q.correct_option,
      explanation: q.explanation,
    }),
  }));

  return c.json({
    id: quizResult.id,
    subject: quizResult.subject,
    theme: quizResult.theme,
    difficulty: quizResult.difficulty,
    styles: parseStyles(quizResult.style),
    questionCount: quizResult.question_count,
    createdAt: quizResult.created_at,
    questions,
    ...(includeAnswers && { learnMode: true }),
  });
});

export { quiz as quizRoutes };

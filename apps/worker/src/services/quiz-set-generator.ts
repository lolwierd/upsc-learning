import { nanoid } from "nanoid";
import type { Env, DatabaseLike } from "../types.js";
import { generateQuiz } from "./llm.js";
import { insertAiGenerationMetric } from "./ai-metrics.js";
import type { QuizSetRunStatus } from "@mcqs/shared";

interface QuizSetItemRow {
  id: string;
  quiz_set_id: string;
  sequence_number: number;
  subject: string;
  theme: string | null;
  difficulty: string;
  styles: string;
  question_count: number;
  era: string | null;
  enable_current_affairs: number;
  current_affairs_theme: string | null;
}

interface GenerationContext {
  env: Env;
  runId: string;
  quizSetId: string;
  userId: string;
  triggerType: "manual" | "scheduled";
}

/**
 * Start a quiz set generation run
 * Creates the run record and run items, then starts async generation
 */
export async function startQuizSetGeneration(
  env: Env,
  quizSetId: string,
  userId: string,
  triggerType: "manual" | "scheduled",
  scheduleId?: string
): Promise<{ runId: string }> {
  const now = Math.floor(Date.now() / 1000);
  const runId = nanoid();

  // Get all items in the quiz set
  const itemsResult = await env.DB.prepare(
    `SELECT * FROM quiz_set_items WHERE quiz_set_id = ? ORDER BY sequence_number`
  )
    .bind(quizSetId)
    .all<QuizSetItemRow>();

  const items = itemsResult.results;

  if (items.length === 0) {
    throw new Error("Quiz set has no items");
  }

  // Create the run record
  await env.DB.prepare(
    `INSERT INTO quiz_set_runs (id, quiz_set_id, schedule_id, trigger_type, status, total_items, completed_items, failed_items, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, 0, 0, ?)`
  )
    .bind(runId, quizSetId, scheduleId || null, triggerType, items.length, now)
    .run();

  // Create run items for each quiz set item
  for (const item of items) {
    const runItemId = nanoid();
    await env.DB.prepare(
      `INSERT INTO quiz_set_run_items (id, run_id, quiz_set_item_id, status)
       VALUES (?, ?, ?, 'pending')`
    )
      .bind(runItemId, runId, item.id)
      .run();
  }

  return { runId };
}

/**
 * Execute the quiz generation for all items in a run
 * Should be called in background (waitUntil or setImmediate)
 */
export async function executeQuizSetGeneration(
  ctx: GenerationContext
): Promise<void> {
  const { env, runId, quizSetId, userId, triggerType } = ctx;

  // Get run items
  const runItemsResult = await env.DB.prepare(
    `SELECT ri.*, qsi.subject, qsi.theme, qsi.difficulty, qsi.styles, qsi.question_count, qsi.era, qsi.enable_current_affairs, qsi.current_affairs_theme
     FROM quiz_set_run_items ri
     JOIN quiz_set_items qsi ON qsi.id = ri.quiz_set_item_id
     WHERE ri.run_id = ?
     ORDER BY qsi.sequence_number`
  )
    .bind(runId)
    .all<{
      id: string;
      run_id: string;
      quiz_set_item_id: string;
      quiz_id: string | null;
      status: string;
      subject: string;
      theme: string | null;
      difficulty: string;
      styles: string;
      question_count: number;
      era: string | null;
      enable_current_affairs: number;
      current_affairs_theme: string | null;
    }>();

  const runItems = runItemsResult.results;
  let completedCount = 0;
  let failedCount = 0;

  // Process each item sequentially
  for (const runItem of runItems) {
    const now = Math.floor(Date.now() / 1000);
    const requestStart = Date.now();

    try {
      // Update run item status to generating
      await env.DB.prepare(
        `UPDATE quiz_set_run_items SET status = 'generating', started_at = ? WHERE id = ?`
      )
        .bind(now, runItem.id)
        .run();

      // Create quiz placeholder
      const quizId = nanoid();
      const stylesJson = runItem.styles;
      const styles = JSON.parse(stylesJson);

      await env.DB.prepare(
        `INSERT INTO quizzes (id, user_id, subject, theme, difficulty, style, question_count, model_used, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          quizId,
          userId,
          runItem.subject,
          runItem.theme || null,
          runItem.difficulty,
          stylesJson,
          runItem.question_count,
          "gemini-3-flash-preview",
          "generating",
          now
        )
        .run();

      // Generate quiz
      const currentAffairsTheme = runItem.current_affairs_theme || runItem.theme || undefined;
      const { questions, metrics } = await generateQuiz(env, {
        subject: runItem.subject as Parameters<typeof generateQuiz>[1]["subject"],
        theme: runItem.theme || undefined,
        difficulty: runItem.difficulty as Parameters<typeof generateQuiz>[1]["difficulty"],
        styles: styles,
        count: runItem.question_count,
        enableFactCheck: env.ENABLE_FACT_CHECK === "1",
        enableCurrentAffairs: runItem.enable_current_affairs === 1,
        currentAffairsTheme,
      });

      // Insert questions
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const questionId = nanoid();
        await env.DB.prepare(
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

      // Update quiz status to completed
      await env.DB.prepare(
        `UPDATE quizzes SET status = 'completed', model_used = ? WHERE id = ?`
      )
        .bind(metrics.model, quizId)
        .run();

      // Update run item as completed
      const completedAt = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `UPDATE quiz_set_run_items SET status = 'completed', quiz_id = ?, completed_at = ? WHERE id = ?`
      )
        .bind(quizId, completedAt, runItem.id)
        .run();

      completedCount++;

      // Store AI metrics
      try {
        await insertAiGenerationMetric(env.DB as Parameters<typeof insertAiGenerationMetric>[0], {
          id: nanoid(),
          quizId,
          userId,
          provider: metrics.provider,
          model: metrics.model,
          factCheckModel: metrics.factCheckModel,
          subject: metrics.subject,
          theme: metrics.theme ?? null,
          difficulty: metrics.difficulty,
          stylesJson,
          status: "success",
          requestedCount: metrics.requestedCount,
          returnedCount: metrics.returnedCount,
          dedupEnabled: metrics.dedupEnabled,
          dedupFilteredCount: metrics.dedupFilteredCount,
          validationIsValid: metrics.validationIsValid,
          validationInvalidCount: metrics.validationInvalidCount,
          validationErrorCount: metrics.validationErrorCount,
          validationWarningCount: metrics.validationWarningCount,
          validationBatchWarningsJson: JSON.stringify(metrics.validationBatchWarnings),
          parseStrategy: metrics.parseStrategy,
          promptChars: metrics.promptChars,
          responseChars: metrics.responseChars,
          totalDurationMs: Date.now() - requestStart,
          generationDurationMs: metrics.generationDurationMs,
          factCheckEnabled: metrics.factCheckEnabled,
          factCheckDurationMs: metrics.factCheckDurationMs,
          factCheckCheckedCount: metrics.factCheckCheckedCount,
          factCheckIssueCount: metrics.factCheckIssueCount,
          usagePromptTokens: metrics.usagePromptTokens,
          usageCompletionTokens: metrics.usageCompletionTokens,
          usageTotalTokens: metrics.usageTotalTokens,
          groundingEnabled: metrics.groundingEnabled,
          groundingSourceCount: metrics.groundingSourceCount,
        });
      } catch (metricsError) {
        console.warn("Failed to store AI metrics for quiz set item:", metricsError);
      }

      // Update run progress
      await env.DB.prepare(
        `UPDATE quiz_set_runs SET completed_items = ? WHERE id = ?`
      )
        .bind(completedCount, runId)
        .run();

    } catch (error) {
      console.error(`Failed to generate quiz for run item ${runItem.id}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update run item as failed
      const completedAt = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `UPDATE quiz_set_run_items SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`
      )
        .bind(errorMessage, completedAt, runItem.id)
        .run();

      failedCount++;

      // Update run progress
      await env.DB.prepare(
        `UPDATE quiz_set_runs SET failed_items = ? WHERE id = ?`
      )
        .bind(failedCount, runId)
        .run();
    }
  }

  // Determine final run status
  const finalStatus: QuizSetRunStatus =
    failedCount === runItems.length ? "failed" :
      failedCount > 0 ? "partial" : "completed";

  const completedAt = Math.floor(Date.now() / 1000);

  // Update run as finished
  await env.DB.prepare(
    `UPDATE quiz_set_runs SET status = ?, completed_at = ? WHERE id = ?`
  )
    .bind(finalStatus, completedAt, runId)
    .run();

  // If this was a scheduled run, update the schedule's last run info
  if (triggerType === "scheduled") {
    await env.DB.prepare(
      `UPDATE quiz_set_schedules SET last_run_at = ?, last_run_status = ?, last_run_error = ? WHERE quiz_set_id = ?`
    )
      .bind(
        completedAt,
        finalStatus,
        failedCount > 0 ? `${failedCount} of ${runItems.length} items failed` : null,
        quizSetId
      )
      .run();
  }
}

/**
 * Helper to start generation and queue the background task
 */
export async function triggerQuizSetGeneration(
  env: Env,
  quizSetId: string,
  userId: string,
  triggerType: "manual" | "scheduled",
  scheduleId?: string,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<{ runId: string }> {
  const { runId } = await startQuizSetGeneration(
    env,
    quizSetId,
    userId,
    triggerType,
    scheduleId
  );

  const generationTask = executeQuizSetGeneration({
    env,
    runId,
    quizSetId,
    userId,
    triggerType,
  });

  // Queue background task
  if (waitUntil) {
    waitUntil(generationTask);
  } else {
    // Fallback for Node.js environment
    setImmediate(() => {
      generationTask.catch((error) => {
        console.error("Quiz set generation task failed:", error);
      });
    });
  }

  return { runId };
}

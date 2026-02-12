import { nanoid } from "nanoid";
import type { Env } from "../types.js";
import { generateQuiz } from "./llm.js";
import { insertAiGenerationMetric } from "./ai-metrics.js";
import type { QuizSetRunStatus } from "@mcqs/shared";
import { emitQuizSetNotifierEvent } from "./notifiers.js";

interface QuizSetItemRow {
  id: string;
  quiz_set_id: string;
  sequence_number: number;
  subject: string;
  theme: string | null;
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
  triggerType: "manual" | "scheduled";
}

const RUN_ITEM_GENERATING_STALE_SECONDS = 10 * 60;

/**
 * Start a quiz set generation run
 * Creates the run record and run items, then starts async generation
 */
export async function startQuizSetGeneration(
  env: Env,
  quizSetId: string,
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
  const { env, runId, quizSetId, triggerType } = ctx;

  // Get run items
  const runItemsResult = await env.DB.prepare(
    `SELECT ri.*, qsi.subject, qsi.theme, qsi.styles, qsi.question_count, qsi.era, qsi.enable_current_affairs, qsi.current_affairs_theme
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
      styles: string;
      question_count: number;
      era: string | null;
      enable_current_affairs: number;
      current_affairs_theme: string | null;
      started_at: number | null;
    }>();

  const runItems = runItemsResult.results;
  let completedCount = runItems.filter((ri) => ri.status === "completed").length;
  let failedCount = runItems.filter((ri) => ri.status === "failed").length;

  // Ensure run progress counts are correct (important for resumed runs)
  await env.DB.prepare(
    `UPDATE quiz_set_runs SET completed_items = ?, failed_items = ? WHERE id = ?`
  )
    .bind(completedCount, failedCount, runId)
    .run();

  // Process each item sequentially
  for (const runItem of runItems) {
    const now = Math.floor(Date.now() / 1000);
    const requestStart = Date.now();
    let activeQuizId: string | null = null;

    try {
      // Skip already-finished items (important for resume)
      if (runItem.status === "completed" || runItem.status === "failed") {
        continue;
      }

      // If another worker is actively generating this item, don't double-generate.
      if (
        runItem.status === "generating" &&
        typeof runItem.started_at === "number" &&
        runItem.started_at > now - RUN_ITEM_GENERATING_STALE_SECONDS
      ) {
        continue;
      }

      // Update run item status to generating
      await env.DB.prepare(
        `UPDATE quiz_set_run_items SET status = 'generating', started_at = ?, error = NULL WHERE id = ?`
      )
        .bind(now, runItem.id)
        .run();

      // Create (or reuse) quiz placeholder
      let quizId = runItem.quiz_id ?? null;
      const stylesJson = runItem.styles;
      const styles = JSON.parse(stylesJson);

      if (quizId) {
        const existingQuiz = await env.DB.prepare(
          `SELECT id FROM quizzes WHERE id = ? LIMIT 1`
        )
          .bind(quizId)
          .first<{ id: string }>();

        if (!existingQuiz) {
          quizId = null;
        }
      }

      if (!quizId) {
        quizId = nanoid();
        await env.DB.prepare(
          `INSERT INTO quizzes (id, user_id, subject, theme, style, question_count, model_used, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            quizId,
            "public",
            runItem.subject,
            runItem.theme || null,
            stylesJson,
            runItem.question_count,
            env.GENERATION_MODEL || "unknown",
            "generating",
            now
          )
          .run();

        // Link placeholder quiz to run item immediately so recovery can resume cleanly
        await env.DB.prepare(
          `UPDATE quiz_set_run_items SET quiz_id = ? WHERE id = ?`
        )
          .bind(quizId, runItem.id)
          .run();
      } else {
        // Reset quiz to a clean generating state in case this is a resume/retry.
        await env.DB.prepare(
          `UPDATE quizzes SET status = 'generating', error = NULL WHERE id = ?`
        )
          .bind(quizId)
          .run();
      }

      activeQuizId = quizId;

      // Avoid duplicate questions if we are resuming or retrying a quiz id.
      await env.DB.prepare(`DELETE FROM questions WHERE quiz_id = ?`)
        .bind(quizId)
        .run();

      // Generate quiz
      const currentAffairsTheme = runItem.current_affairs_theme || runItem.theme || undefined;
      const { questions, metrics } = await generateQuiz(env, {
        subject: runItem.subject as Parameters<typeof generateQuiz>[1]["subject"],
        theme: runItem.theme || undefined,
        styles: styles,
        count: runItem.question_count,
        enableFactCheck: env.ENABLE_FACT_CHECK === "1",
        enableDeduplication: true,
        enableCurrentAffairs: true, // Force enable current affairs for all quiz sets
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
          provider: metrics.provider,
          model: metrics.model,
          factCheckModel: metrics.factCheckModel,
          subject: metrics.subject,
          theme: metrics.theme ?? null,
          stylesJson,
          status: "success",
          requestedCount: metrics.requestedCount,
          returnedCount: metrics.returnedCount,
          dedupEnabled: metrics.dedupEnabled,
          dedupFilteredCount: metrics.dedupFilteredCount,
          emergencyNoDedupeAcceptedCount: metrics.emergencyNoDedupeAcceptedCount,
          regenerationAttemptsUsed: metrics.regenerationAttemptsUsed,
          emergencyRegenerationAttemptsUsed: metrics.emergencyRegenerationAttemptsUsed,
          generationCallCount: metrics.generationCallCount,
          initialGenerationCallCount: metrics.initialGenerationCallCount,
          regenerationCallCount: metrics.regenerationCallCount,
          emergencyRegenerationCallCount: metrics.emergencyRegenerationCallCount,
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
          requestPrompt: metrics.requestPrompt,
          rawResponse: metrics.rawResponse,
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

      // Mark quiz placeholder as failed (if present) to avoid stuck "generating" quizzes.
      if (activeQuizId) {
        try {
          await env.DB.prepare(
            `UPDATE quizzes SET status = 'failed', error = ? WHERE id = ?`
          )
            .bind(errorMessage, activeQuizId)
            .run();
        } catch (quizUpdateError) {
          console.warn("Failed to update quiz status after run item failure:", quizUpdateError);
        }
      }

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

      try {
        await emitQuizSetNotifierEvent(env, {
          type: "quiz_set.generation.item_failed",
          quizSetId,
          runId,
          runItemId: runItem.id,
          subject: runItem.subject,
          theme: runItem.theme,
          questionCount: runItem.question_count,
          error: errorMessage,
        });
      } catch (notifyError) {
        console.warn("Failed to send item failure notification:", notifyError);
      }
    }
  }

  // Recompute counts from DB to ensure we don't finalize while items are still pending/generating
  const counts = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status IN ('pending', 'generating') THEN 1 ELSE 0 END) AS unfinished
     FROM quiz_set_run_items
     WHERE run_id = ?`
  )
    .bind(runId)
    .first<{ completed: number | null; failed: number | null; unfinished: number | null }>();

  const dbCompleted = counts?.completed ?? 0;
  const dbFailed = counts?.failed ?? 0;
  const dbUnfinished = counts?.unfinished ?? 0;

  await env.DB.prepare(
    `UPDATE quiz_set_runs SET completed_items = ?, failed_items = ? WHERE id = ?`
  )
    .bind(dbCompleted, dbFailed, runId)
    .run();

  if (dbUnfinished > 0) {
    // Another worker may still be processing, or this run was resumed while items are in-flight.
    return;
  }

  // Determine final run status
  const finalStatus: QuizSetRunStatus =
    dbFailed === runItems.length ? "failed" :
      dbFailed > 0 ? "partial" : "completed";

  const completedAt = Math.floor(Date.now() / 1000);

  // Update run as finished
  await env.DB.prepare(
    `UPDATE quiz_set_runs SET status = ?, completed_at = ? WHERE id = ?`
  )
    .bind(finalStatus, completedAt, runId)
    .run();

  try {
    await emitQuizSetNotifierEvent(env, {
      type:
        finalStatus === "completed"
          ? "quiz_set.generation.completed"
          : finalStatus === "partial"
            ? "quiz_set.generation.partial"
            : "quiz_set.generation.failed",
      quizSetId,
      runId,
      triggerType,
    });
  } catch (notifyError) {
    console.warn("Failed to send run completion notification:", notifyError);
  }

  // If this was a scheduled run, update the schedule's last run info
  if (triggerType === "scheduled") {
    await env.DB.prepare(
      `UPDATE quiz_set_schedules SET last_run_at = ?, last_run_status = ?, last_run_error = ? WHERE quiz_set_id = ?`
    )
      .bind(
        completedAt,
        finalStatus,
        dbFailed > 0 ? `${dbFailed} of ${runItems.length} items failed` : null,
        quizSetId
      )
      .run();
  }
}

/**
 * Resume generation for an existing run (e.g., after a worker restart).
 */
export async function resumeQuizSetRun(
  env: Env,
  runId: string,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<void> {
  const run = await env.DB.prepare(
    `SELECT id, quiz_set_id, trigger_type, status FROM quiz_set_runs WHERE id = ? LIMIT 1`
  )
    .bind(runId)
    .first<{ id: string; quiz_set_id: string; trigger_type: "manual" | "scheduled"; status: string }>();

  if (!run) return;
  if (run.status !== "running") return;

  const task = executeQuizSetGeneration({
    env,
    runId: run.id,
    quizSetId: run.quiz_set_id,
    triggerType: run.trigger_type,
  });

  if (waitUntil) {
    waitUntil(task);
  } else {
    setImmediate(() => {
      task.catch((error) => {
        console.error("Quiz set resume task failed:", error);
      });
    });
  }
}

/**
 * Helper to start generation and queue the background task
 */
export async function triggerQuizSetGeneration(
  env: Env,
  quizSetId: string,
  triggerType: "manual" | "scheduled",
  scheduleId?: string,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<{ runId: string }> {
  const { runId } = await startQuizSetGeneration(
    env,
    quizSetId,
    triggerType,
    scheduleId
  );

  const generationTask = executeQuizSetGeneration({
    env,
    runId,
    quizSetId,
    triggerType,
  });

  try {
    await emitQuizSetNotifierEvent(env, {
      type: "quiz_set.generation.started",
      quizSetId,
      runId,
      triggerType,
      scheduleId: scheduleId || null,
    });
  } catch (notifyError) {
    console.warn("Failed to send run start notification:", notifyError);
  }

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

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import type { Env } from "../types.js";
import {
  createQuizSetRequestSchema,
  duplicateQuizSetRequestSchema,
  updateQuizSetRequestSchema,
  addQuizSetItemRequestSchema,
  updateQuizSetItemRequestSchema,
  reorderQuizSetItemsRequestSchema,
  quizSetScheduleRequestSchema,
  toggleScheduleRequestSchema,
  createQuizSetNotifierRequestSchema,
  updateQuizSetNotifierRequestSchema,
} from "@mcqs/shared";
import type {
  QuizSetItem,
  QuizSetSchedule,
  QuizSetRun,
  QuizSetRunItem,
  QuizSetListItem,
  QuizSetWithSchedule,
  QuizSetNotifier,
} from "@mcqs/shared";
import { triggerQuizSetGeneration } from "../services/quiz-set-generator.js";
import { getScheduler } from "../services/scheduler.js";
import {
  createQuizSetNotifier,
  updateQuizSetNotifier,
  deleteQuizSetNotifier,
  emitQuizSetNotifierEvent,
  listQuizSetNotifiers,
} from "../services/notifiers.js";

const quizSets = new Hono<{ Bindings: Env }>();

type WaitUntilContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

// Database row types
interface QuizSetRow {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

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
  force_static: number;
  created_at: number;
  updated_at: number;
}

interface QuizSetScheduleRow {
  id: string;
  quiz_set_id: string;
  cron_expression: string;
  timezone: string;
  is_enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  last_run_status: string | null;
  last_run_error: string | null;
  created_at: number;
  updated_at: number;
}

interface QuizSetRunRow {
  id: string;
  quiz_set_id: string;
  schedule_id: string | null;
  trigger_type: string;
  status: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  started_at: number;
  completed_at: number | null;
  error: string | null;
}

interface QuizSetRunItemRow {
  id: string;
  run_id: string;
  quiz_set_item_id: string;
  quiz_id: string | null;
  status: string;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
}

interface SourceQuizSetRow extends QuizSetRow {
  user_id: string;
}

interface NotificationDestinationCopyRow {
  user_id: string;
  provider: string;
  label: string | null;
  target_url: string;
  events: string;
  is_enabled: number;
}

// Helper functions
function mapQuizSetRowToResponse(row: QuizSetRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuizSetItemRowToResponse(row: QuizSetItemRow): QuizSetItem {
  return {
    id: row.id,
    quizSetId: row.quiz_set_id,
    sequenceNumber: row.sequence_number,
    subject: row.subject as QuizSetItem["subject"],
    theme: row.theme || undefined,
    styles: JSON.parse(row.styles) as QuizSetItem["styles"],
    questionCount: row.question_count,
    enableCurrentAffairs: row.enable_current_affairs === 1,
    currentAffairsTheme: row.current_affairs_theme || undefined,
    forceStatic: row.force_static === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduleRowToResponse(row: QuizSetScheduleRow): QuizSetSchedule {
  return {
    id: row.id,
    quizSetId: row.quiz_set_id,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    isEnabled: row.is_enabled === 1,
    nextRunAt: row.next_run_at || undefined,
    lastRunAt: row.last_run_at || undefined,
    lastRunStatus: (row.last_run_status as QuizSetSchedule["lastRunStatus"]) || undefined,
    lastRunError: row.last_run_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRowToResponse(row: QuizSetRunRow): QuizSetRun {
  return {
    id: row.id,
    quizSetId: row.quiz_set_id,
    scheduleId: row.schedule_id || undefined,
    triggerType: row.trigger_type as QuizSetRun["triggerType"],
    status: row.status as QuizSetRun["status"],
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    error: row.error || undefined,
  };
}

function mapRunItemRowToResponse(row: QuizSetRunItemRow): QuizSetRunItem {
  return {
    id: row.id,
    runId: row.run_id,
    quizSetItemId: row.quiz_set_item_id,
    quizId: row.quiz_id || undefined,
    status: row.status as QuizSetRunItem["status"],
    error: row.error || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
  };
}

async function emitQuizSetModified(
  env: Env,
  quizSetId: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await emitQuizSetNotifierEvent(env, {
      type: "quiz_set.modified",
      quizSetId,
      action,
      details,
    });
  } catch (error) {
    console.warn("Failed to emit quiz set modified notification:", error);
  }
}

// ============================================
// Quiz Sets CRUD
// ============================================

// GET /api/quiz-sets - List quiz sets
quizSets.get("/", async (c) => {
  const setsResult = await c.env.DB.prepare(
    `SELECT qs.*,
            COUNT(qsi.id) as item_count,
            qss.is_enabled as schedule_enabled,
            qss.next_run_at as schedule_next_run,
            qss.last_run_at as schedule_last_run,
            qss.last_run_status as schedule_last_status
     FROM quiz_sets qs
     LEFT JOIN quiz_set_items qsi ON qsi.quiz_set_id = qs.id
     LEFT JOIN quiz_set_schedules qss ON qss.quiz_set_id = qs.id
     GROUP BY qs.id
     ORDER BY qs.updated_at DESC`
  )
    .all<QuizSetRow & {
      item_count: number;
      schedule_enabled: number | null;
      schedule_next_run: number | null;
      schedule_last_run: number | null;
      schedule_last_status: string | null;
    }>();

  const sets: QuizSetListItem[] = setsResult.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    isActive: row.is_active === 1,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schedule: row.schedule_enabled !== null ? {
      isEnabled: row.schedule_enabled === 1,
      nextRunAt: row.schedule_next_run || undefined,
      lastRunAt: row.schedule_last_run || undefined,
      lastRunStatus: row.schedule_last_status as QuizSetRun["status"] | undefined,
    } : undefined,
  }));

  return c.json({ sets });
});

// POST /api/quiz-sets - Create new quiz set
quizSets.post(
  "/",
  zValidator("json", createQuizSetRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);
    const setId = nanoid();

    // Create the quiz set
    await c.env.DB.prepare(
      `INSERT INTO quiz_sets (id, user_id, name, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(setId, "public", body.name, body.description || null, now, now)
      .run();

    // Create items if provided
    if (body.items && body.items.length > 0) {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        const itemId = nanoid();
        await c.env.DB.prepare(
          `INSERT INTO quiz_set_items (id, quiz_set_id, sequence_number, subject, theme, styles, question_count, era, enable_current_affairs, current_affairs_theme, force_static, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            itemId,
            setId,
            i + 1,
            item.subject,
            item.theme || null,
            JSON.stringify(item.styles),
            item.questionCount,
            "current", // Always use current era
            item.forceStatic ? 0 : 1,
            item.forceStatic ? null : item.currentAffairsTheme || null,
            item.forceStatic ? 1 : 0,
            now,
            now
          )
          .run();
      }
    }

    // Fetch and return the created set with items
    const setRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first<QuizSetRow>();

    const itemsResult = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_items WHERE quiz_set_id = ? ORDER BY sequence_number`
    )
      .bind(setId)
      .all<QuizSetItemRow>();

    const quizSet: QuizSetWithSchedule = {
      ...mapQuizSetRowToResponse(setRow!),
      items: itemsResult.results.map(mapQuizSetItemRowToResponse),
      itemCount: itemsResult.results.length,
    };

    await emitQuizSetModified(c.env, setId, "set_created", {
      name: body.name,
      itemCount: itemsResult.results.length,
    });

    return c.json(quizSet, 201);
  }
);

// POST /api/quiz-sets/:id/duplicate - Duplicate an existing quiz set
quizSets.post(
  "/:id/duplicate",
  zValidator("json", duplicateQuizSetRequestSchema),
  async (c) => {
    const sourceSetId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    const sourceSet = await c.env.DB.prepare(
      `SELECT id, user_id, name, description, is_active, created_at, updated_at
       FROM quiz_sets
       WHERE id = ?`
    )
      .bind(sourceSetId)
      .first<SourceQuizSetRow>();

    if (!sourceSet) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    const duplicateName = body.name || (
      sourceSet.name.length <= 93
        ? `${sourceSet.name} (Copy)`
        : `${sourceSet.name.slice(0, 93)} (Copy)`
    );

    const newSetId = nanoid();

    // Fetch all source data upfront, then batch-insert for atomicity
    const sourceItems = await c.env.DB.prepare(
      `SELECT *
       FROM quiz_set_items
       WHERE quiz_set_id = ?
       ORDER BY sequence_number ASC`
    )
      .bind(sourceSetId)
      .all<QuizSetItemRow>();

    const batchStatements = [
      c.env.DB.prepare(
        `INSERT INTO quiz_sets (id, user_id, name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newSetId,
        "public",
        duplicateName,
        sourceSet.description || null,
        sourceSet.is_active,
        now,
        now
      ),
    ];

    for (const item of sourceItems.results) {
      batchStatements.push(
        c.env.DB.prepare(
          `INSERT INTO quiz_set_items (id, quiz_set_id, sequence_number, subject, theme, styles, question_count, era, enable_current_affairs, current_affairs_theme, force_static, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          nanoid(),
          newSetId,
          item.sequence_number,
          item.subject,
          item.theme || null,
          item.styles,
          item.question_count,
          item.era || "current",
          item.enable_current_affairs,
          item.current_affairs_theme || null,
          item.force_static,
          now,
          now
        )
      );
    }

    if (body.includeSchedule) {
      const sourceSchedule = await c.env.DB.prepare(
        `SELECT cron_expression, timezone, is_enabled
         FROM quiz_set_schedules
         WHERE quiz_set_id = ?`
      )
        .bind(sourceSetId)
        .first<{
          cron_expression: string;
          timezone: string;
          is_enabled: number;
        }>();

      if (sourceSchedule) {
        batchStatements.push(
          c.env.DB.prepare(
            `INSERT INTO quiz_set_schedules (id, quiz_set_id, cron_expression, timezone, is_enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            nanoid(),
            newSetId,
            sourceSchedule.cron_expression,
            sourceSchedule.timezone,
            sourceSchedule.is_enabled,
            now,
            now
          )
        );
      }
    }

    if (body.includeNotifiers) {
      const sourceNotifiers = await c.env.DB.prepare(
        `SELECT user_id, provider, label, target_url, events, is_enabled
         FROM notification_destinations
         WHERE scope_type = 'quiz_set' AND scope_id = ?
         ORDER BY created_at ASC`
      )
        .bind(sourceSetId)
        .all<NotificationDestinationCopyRow>();

      for (const notifier of sourceNotifiers.results) {
        const copiedTargetUrl = notifier.target_url?.trim()
          ? notifier.target_url
          : "https://discord.invalid/webhook-needs-setup";
        batchStatements.push(
          c.env.DB.prepare(
            `INSERT INTO notification_destinations
              (id, user_id, scope_type, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at)
             VALUES (?, ?, 'quiz_set', ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            nanoid(),
            "public",
            newSetId,
            notifier.provider,
            notifier.label ? `${notifier.label} (needs setup)` : "(needs setup)",
            copiedTargetUrl,
            notifier.events,
            0,
            now,
            now
          )
        );
      }
    }

    // Execute statements sequentially for compatibility across runtimes.
    for (const statement of batchStatements) {
      await statement.run();
    }

    const setRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_sets WHERE id = ?`
    )
      .bind(newSetId)
      .first<QuizSetRow>();
    const itemsResult = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_items WHERE quiz_set_id = ? ORDER BY sequence_number`
    )
      .bind(newSetId)
      .all<QuizSetItemRow>();
    const scheduleRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
    )
      .bind(newSetId)
      .first<QuizSetScheduleRow>();

    if (body.includeSchedule) {
      try {
        await getScheduler(c.env).reloadQuizSetSchedule(newSetId);
      } catch (error) {
        console.warn(
          "Failed to reload duplicated quiz set schedule:",
          error instanceof Error ? error.message : error
        );
      }
    }

    await emitQuizSetModified(c.env, sourceSetId, "set_duplicated", {
      duplicatedSetId: newSetId,
      includeSchedule: body.includeSchedule,
      includeNotifiers: body.includeNotifiers,
    });
    await emitQuizSetModified(c.env, newSetId, "set_created_from_duplicate", {
      sourceSetId,
      sourceSetName: sourceSet.name,
      includeSchedule: body.includeSchedule,
      includeNotifiers: body.includeNotifiers,
    });

    const duplicatedQuizSet: QuizSetWithSchedule = {
      ...mapQuizSetRowToResponse(setRow!),
      items: itemsResult.results.map(mapQuizSetItemRowToResponse),
      itemCount: itemsResult.results.length,
      schedule: scheduleRow ? mapScheduleRowToResponse(scheduleRow) : undefined,
    };

    return c.json(duplicatedQuizSet, 201);
  }
);

// GET /api/quiz-sets/:id - Get quiz set with items and schedule
quizSets.get("/:id", async (c) => {
  const setId = c.req.param("id");

  const setRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first<QuizSetRow>();

  if (!setRow) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const itemsResult = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_items WHERE quiz_set_id = ? ORDER BY sequence_number`
  )
    .bind(setId)
    .all<QuizSetItemRow>();

  const scheduleRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
  )
    .bind(setId)
    .first<QuizSetScheduleRow>();

  const quizSet: QuizSetWithSchedule = {
    ...mapQuizSetRowToResponse(setRow),
    items: itemsResult.results.map(mapQuizSetItemRowToResponse),
    itemCount: itemsResult.results.length,
    schedule: scheduleRow ? mapScheduleRowToResponse(scheduleRow) : undefined,
  };

  return c.json(quizSet);
});

// PATCH /api/quiz-sets/:id - Update quiz set metadata
quizSets.patch(
  "/:id",
  zValidator("json", updateQuizSetRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    // Build update query
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description || null);
    }
    if (body.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(body.isActive ? 1 : 0);
    }

    values.push(setId);

    await c.env.DB.prepare(
      `UPDATE quiz_sets SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...values)
      .run();

    // Return updated set
    const setRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first<QuizSetRow>();

    await emitQuizSetModified(c.env, setId, "set_metadata_updated", {
      name: body.name,
      description: body.description,
      isActive: body.isActive,
    });

    return c.json(mapQuizSetRowToResponse(setRow!));
  }
);

// DELETE /api/quiz-sets/:id - Delete quiz set
quizSets.delete("/:id", async (c) => {
  const setId = c.req.param("id");

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  await emitQuizSetModified(c.env, setId, "set_deleted", {
    quizSetId: setId,
  });

  // Delete scoped notifiers explicitly (notification_destinations has no FK to quiz_sets).
  await c.env.DB.prepare(
    `DELETE FROM notification_destinations
     WHERE scope_type = 'quiz_set' AND scope_id = ?`
  )
    .bind(setId)
    .run();

  // Delete (cascade will handle items, schedules, runs)
  await c.env.DB.prepare(`DELETE FROM quiz_sets WHERE id = ?`)
    .bind(setId)
    .run();

  return c.json({ success: true });
});

// ============================================
// Quiz Set Items
// ============================================

// POST /api/quiz-sets/:id/items - Add item to set
quizSets.post(
  "/:id/items",
  zValidator("json", addQuizSetItemRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    // Get max sequence number
    const maxSeq = await c.env.DB.prepare(
      `SELECT MAX(sequence_number) as max_seq FROM quiz_set_items WHERE quiz_set_id = ?`
    )
      .bind(setId)
      .first<{ max_seq: number | null }>();

    const sequenceNumber = (maxSeq?.max_seq || 0) + 1;
    const itemId = nanoid();

    await c.env.DB.prepare(
      `INSERT INTO quiz_set_items (id, quiz_set_id, sequence_number, subject, theme, styles, question_count, era, enable_current_affairs, current_affairs_theme, force_static, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        setId,
        sequenceNumber,
        body.subject,
        body.theme || null,
        JSON.stringify(body.styles),
        body.questionCount,
        "current", // Always use current era
        body.forceStatic ? 0 : 1,
        body.forceStatic ? null : body.currentAffairsTheme || null,
        body.forceStatic ? 1 : 0,
        now,
        now
      )
      .run();

    // Update quiz set timestamp
    await c.env.DB.prepare(
      `UPDATE quiz_sets SET updated_at = ? WHERE id = ?`
    )
      .bind(now, setId)
      .run();

    const itemRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_items WHERE id = ?`
    )
      .bind(itemId)
      .first<QuizSetItemRow>();

    await emitQuizSetModified(c.env, setId, "set_item_added", {
      subject: body.subject,
      theme: body.theme,
      questionCount: body.questionCount,
      styles: body.styles,
      sequenceNumber,
    });

    return c.json(mapQuizSetItemRowToResponse(itemRow!), 201);
  }
);

// PATCH /api/quiz-sets/:id/items/:itemId - Update item
quizSets.patch(
  "/:id/items/:itemId",
  zValidator("json", updateQuizSetItemRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT qsi.id, qsi.force_static FROM quiz_set_items qsi
       WHERE qsi.id = ? AND qsi.quiz_set_id = ?`
    )
      .bind(itemId, setId)
      .first<{ id: string; force_static: number }>();

    if (!existing) {
      return c.json({ error: "Item not found" }, 404);
    }

    // Build update query
    const updates: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];

    if (body.subject !== undefined) {
      updates.push("subject = ?");
      values.push(body.subject);
    }
    if (body.theme !== undefined) {
      updates.push("theme = ?");
      values.push(body.theme || null);
    }
    if (body.styles !== undefined) {
      updates.push("styles = ?");
      values.push(JSON.stringify(body.styles));
    }
    if (body.questionCount !== undefined) {
      updates.push("question_count = ?");
      values.push(body.questionCount);
    }
    const effectiveForceStatic = body.forceStatic ?? (existing.force_static === 1);

    if (body.enableCurrentAffairs !== undefined && !effectiveForceStatic) {
      updates.push("enable_current_affairs = ?");
      values.push(body.enableCurrentAffairs ? 1 : 0);
    }
    if (body.currentAffairsTheme !== undefined && !effectiveForceStatic) {
      updates.push("current_affairs_theme = ?");
      values.push(body.currentAffairsTheme || null);
    }
    if (body.forceStatic !== undefined) {
      updates.push("force_static = ?");
      values.push(body.forceStatic ? 1 : 0);
    }

    if (effectiveForceStatic) {
      updates.push("enable_current_affairs = ?");
      values.push(0);
      updates.push("current_affairs_theme = ?");
      values.push(null);
    } else if (body.forceStatic === false && body.enableCurrentAffairs === undefined) {
      updates.push("enable_current_affairs = ?");
      values.push(1);
    }

    values.push(itemId);

    await c.env.DB.prepare(
      `UPDATE quiz_set_items SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...values)
      .run();

    // Update quiz set timestamp
    await c.env.DB.prepare(
      `UPDATE quiz_sets SET updated_at = ? WHERE id = ?`
    )
      .bind(now, setId)
      .run();

    const itemRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_items WHERE id = ?`
    )
      .bind(itemId)
      .first<QuizSetItemRow>();

    await emitQuizSetModified(c.env, setId, "set_item_updated", {
      itemId,
      subject: body.subject,
      theme: body.theme,
      questionCount: body.questionCount,
      styles: body.styles,
    });

    return c.json(mapQuizSetItemRowToResponse(itemRow!));
  }
);

// DELETE /api/quiz-sets/:id/items/:itemId - Remove item
quizSets.delete("/:id/items/:itemId", async (c) => {
  const setId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const now = Math.floor(Date.now() / 1000);

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT qsi.sequence_number FROM quiz_set_items qsi
     WHERE qsi.id = ? AND qsi.quiz_set_id = ?`
  )
    .bind(itemId, setId)
    .first<{ sequence_number: number }>();

  if (!existing) {
    return c.json({ error: "Item not found" }, 404);
  }

  // Delete the item
  await c.env.DB.prepare(`DELETE FROM quiz_set_items WHERE id = ?`)
    .bind(itemId)
    .run();

  // Reorder remaining items
  await c.env.DB.prepare(
    `UPDATE quiz_set_items
     SET sequence_number = sequence_number - 1, updated_at = ?
     WHERE quiz_set_id = ? AND sequence_number > ?`
  )
    .bind(now, setId, existing.sequence_number)
    .run();

  // Update quiz set timestamp
  await c.env.DB.prepare(
    `UPDATE quiz_sets SET updated_at = ? WHERE id = ?`
  )
    .bind(now, setId)
    .run();

  await emitQuizSetModified(c.env, setId, "set_item_deleted", {
    itemId,
    sequenceNumber: existing.sequence_number,
  });

  return c.json({ success: true });
});

// POST /api/quiz-sets/:id/items/reorder - Reorder items
quizSets.post(
  "/:id/items/reorder",
  zValidator("json", reorderQuizSetItemsRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    // Update sequence numbers
    for (let i = 0; i < body.itemIds.length; i++) {
      await c.env.DB.prepare(
        `UPDATE quiz_set_items SET sequence_number = ?, updated_at = ?
         WHERE id = ? AND quiz_set_id = ?`
      )
        .bind(i + 1, now, body.itemIds[i], setId)
        .run();
    }

    // Update quiz set timestamp
    await c.env.DB.prepare(
      `UPDATE quiz_sets SET updated_at = ? WHERE id = ?`
    )
      .bind(now, setId)
      .run();

    await emitQuizSetModified(c.env, setId, "set_items_reordered", {
      itemCount: body.itemIds.length,
    });

    return c.json({ success: true });
  }
);

// ============================================
// Quiz Set Generation
// ============================================

// POST /api/quiz-sets/:id/generate - Start generation
quizSets.post("/:id/generate", async (c) => {
  const setId = c.req.param("id");

  // Check ownership and get item count
  const existing = await c.env.DB.prepare(
    `SELECT qs.id, COUNT(qsi.id) as item_count
     FROM quiz_sets qs
     LEFT JOIN quiz_set_items qsi ON qsi.quiz_set_id = qs.id
     WHERE qs.id = ?
     GROUP BY qs.id`
  )
    .bind(setId)
    .first<{ id: string; item_count: number }>();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  if (existing.item_count === 0) {
    return c.json({ error: "Quiz set has no items to generate" }, 400);
  }

  // Check if there's already a running generation
  const runningRun = await c.env.DB.prepare(
    `SELECT id FROM quiz_set_runs WHERE quiz_set_id = ? AND status = 'running' LIMIT 1`
  )
    .bind(setId)
    .first();

  if (runningRun) {
    return c.json({ error: "A generation is already in progress for this set" }, 409);
  }

  // Get waitUntil for background task
  let executionCtx: WaitUntilContext | undefined;
  try {
    executionCtx = c.executionCtx;
  } catch {
    executionCtx = undefined;
  }

  const { runId } = await triggerQuizSetGeneration(
    c.env,
    setId,
    "manual",
    undefined,
    executionCtx?.waitUntil.bind(executionCtx)
  );

  return c.json({ runId, status: "running" }, 202);
});

// ============================================
// Quiz Set Runs
// ============================================

// ============================================
// Quiz Set Notifiers
// ============================================

// GET /api/quiz-sets/:id/notifiers - List notifiers
quizSets.get("/:id/notifiers", async (c) => {
  const setId = c.req.param("id");

  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const notifiers: QuizSetNotifier[] = await listQuizSetNotifiers(c.env, setId);
  return c.json({ notifiers });
});

// POST /api/quiz-sets/:id/notifiers - Create notifier
quizSets.post(
  "/:id/notifiers",
  zValidator("json", createQuizSetNotifierRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    try {
      const notifier = await createQuizSetNotifier(c.env, {
        quizSetId: setId,
        provider: body.provider,
        label: body.label,
        targetUrl: body.targetUrl,
        isEnabled: body.isEnabled,
        events: body.events,
      });

      return c.json({ notifier }, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Target URL")) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

// PATCH /api/quiz-sets/:id/notifiers/:notifierId - Update notifier
quizSets.patch(
  "/:id/notifiers/:notifierId",
  zValidator("json", updateQuizSetNotifierRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const notifierId = c.req.param("notifierId");
    const body = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    try {
      const notifier = await updateQuizSetNotifier(c.env, {
        quizSetId: setId,
        notifierId,
        label: body.label,
        targetUrl: body.targetUrl,
        isEnabled: body.isEnabled,
        events: body.events,
      });
      return c.json({ notifier });
    } catch (error) {
      if (error instanceof Error && error.message === "Notifier not found") {
        return c.json({ error: "Notifier not found" }, 404);
      }
      if (
        error instanceof Error &&
        (error.message.includes("target URL") || error.message.includes("Target URL"))
      ) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

// DELETE /api/quiz-sets/:id/notifiers/:notifierId - Delete notifier
quizSets.delete("/:id/notifiers/:notifierId", async (c) => {
  const setId = c.req.param("id");
  const notifierId = c.req.param("notifierId");

  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const deleted = await deleteQuizSetNotifier(c.env, setId, notifierId);
  if (!deleted) {
    return c.json({ error: "Notifier not found" }, 404);
  }

  return c.json({ success: true });
});

// GET /api/quiz-sets/:id/runs - List generation runs
quizSets.get("/:id/runs", async (c) => {
  const setId = c.req.param("id");

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const runsResult = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_runs WHERE quiz_set_id = ? ORDER BY started_at DESC LIMIT 50`
  )
    .bind(setId)
    .all<QuizSetRunRow>();

  const runs: QuizSetRun[] = runsResult.results.map(mapRunRowToResponse);

  return c.json({ runs });
});

// GET /api/quiz-sets/:id/runs/:runId - Get run details with items
quizSets.get("/:id/runs/:runId", async (c) => {
  const setId = c.req.param("id");
  const runId = c.req.param("runId");

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const runRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_runs WHERE id = ? AND quiz_set_id = ?`
  )
    .bind(runId, setId)
    .first<QuizSetRunRow>();

  if (!runRow) {
    return c.json({ error: "Run not found" }, 404);
  }

  const runItemsResult = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_run_items WHERE run_id = ?`
  )
    .bind(runId)
    .all<QuizSetRunItemRow>();

  return c.json({
    ...mapRunRowToResponse(runRow),
    runItems: runItemsResult.results.map(mapRunItemRowToResponse),
  });
});

// POST /api/quiz-sets/:id/runs/:runId/cancel - Cancel an in-progress generation run
quizSets.post("/:id/runs/:runId/cancel", async (c) => {
  const setId = c.req.param("id");
  const runId = c.req.param("runId");
  const now = Math.floor(Date.now() / 1000);
  const cancelMessage = "Run cancelled by user";

  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const runRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_runs WHERE id = ? AND quiz_set_id = ?`
  )
    .bind(runId, setId)
    .first<QuizSetRunRow>();

  if (!runRow) {
    return c.json({ error: "Run not found" }, 404);
  }

  if (runRow.status !== "running") {
    return c.json({ error: `Run is already ${runRow.status}` }, 409);
  }

  const activeItems = await c.env.DB.prepare(
    `SELECT id, quiz_id FROM quiz_set_run_items
     WHERE run_id = ? AND status IN ('pending', 'generating')`
  )
    .bind(runId)
    .all<{ id: string; quiz_id: string | null }>();

  await c.env.DB.prepare(
    `UPDATE quiz_set_runs
     SET status = 'cancelled', completed_at = ?, error = ?
     WHERE id = ?`
  )
    .bind(now, cancelMessage, runId)
    .run();

  await c.env.DB.prepare(
    `UPDATE quiz_set_run_items
     SET status = 'cancelled',
         error = COALESCE(error, ?),
         completed_at = COALESCE(completed_at, ?),
         quiz_id = NULL
     WHERE run_id = ? AND status IN ('pending', 'generating')`
  )
    .bind(cancelMessage, now, runId)
    .run();

  for (const item of activeItems.results) {
    if (!item.quiz_id) continue;
    await c.env.DB.prepare(
      `DELETE FROM quizzes WHERE id = ?`
    )
      .bind(item.quiz_id)
      .run();
  }

  const counts = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM quiz_set_run_items
     WHERE run_id = ?`
  )
    .bind(runId)
    .first<{ completed: number | null; failed: number | null }>();

  await c.env.DB.prepare(
    `UPDATE quiz_set_runs SET completed_items = ?, failed_items = ? WHERE id = ?`
  )
    .bind(counts?.completed ?? 0, counts?.failed ?? 0, runId)
    .run();

  if (runRow.trigger_type === "scheduled") {
    await c.env.DB.prepare(
      `UPDATE quiz_set_schedules
       SET last_run_at = ?, last_run_status = ?, last_run_error = ?
       WHERE quiz_set_id = ?`
    )
      .bind(now, "cancelled", cancelMessage, setId)
      .run();
  }

  const cancelledRunRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_runs WHERE id = ? AND quiz_set_id = ?`
  )
    .bind(runId, setId)
    .first<QuizSetRunRow>();

  if (!cancelledRunRow) {
    return c.json({ error: "Run not found after cancellation" }, 500);
  }

  const cancelledItemsResult = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_run_items WHERE run_id = ?`
  )
    .bind(runId)
    .all<QuizSetRunItemRow>();

  return c.json({
    ...mapRunRowToResponse(cancelledRunRow),
    runItems: cancelledItemsResult.results.map(mapRunItemRowToResponse),
  });
});

// ============================================
// Quiz Set Schedule
// ============================================

// GET /api/quiz-sets/:id/schedule - Get schedule
quizSets.get("/:id/schedule", async (c) => {
  const setId = c.req.param("id");

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const scheduleRow = await c.env.DB.prepare(
    `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
  )
    .bind(setId)
    .first<QuizSetScheduleRow>();

  if (!scheduleRow) {
    return c.json({ schedule: null });
  }

  return c.json({ schedule: mapScheduleRowToResponse(scheduleRow) });
});

// PUT /api/quiz-sets/:id/schedule - Create or update schedule
quizSets.put(
  "/:id/schedule",
  zValidator("json", quizSetScheduleRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    // Check if schedule already exists
    const existingSchedule = await c.env.DB.prepare(
      `SELECT id FROM quiz_set_schedules WHERE quiz_set_id = ?`
    )
      .bind(setId)
      .first<{ id: string }>();

    if (existingSchedule) {
      // Update existing
      await c.env.DB.prepare(
        `UPDATE quiz_set_schedules
         SET cron_expression = ?, timezone = ?, is_enabled = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          body.cronExpression,
          body.timezone,
          body.isEnabled ? 1 : 0,
          now,
          existingSchedule.id
        )
        .run();
    } else {
      // Create new
      const scheduleId = nanoid();
      await c.env.DB.prepare(
        `INSERT INTO quiz_set_schedules (id, quiz_set_id, cron_expression, timezone, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          scheduleId,
          setId,
          body.cronExpression,
          body.timezone,
          body.isEnabled ? 1 : 0,
          now,
          now
        )
        .run();
    }

    const scheduleRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
    )
      .bind(setId)
      .first<QuizSetScheduleRow>();

    try {
      await getScheduler(c.env).reloadQuizSetSchedule(setId);
    } catch (error) {
      console.warn(
        "Failed to reload quiz set schedule after update:",
        error instanceof Error ? error.message : error
      );
    }

    await emitQuizSetModified(c.env, setId, "set_schedule_updated", {
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      isEnabled: body.isEnabled,
    });

    return c.json({ schedule: mapScheduleRowToResponse(scheduleRow!) });
  }
);

// DELETE /api/quiz-sets/:id/schedule - Remove schedule
quizSets.delete("/:id/schedule", async (c) => {
  const setId = c.req.param("id");

  // Check ownership
  const existing = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!existing) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  await c.env.DB.prepare(
    `DELETE FROM quiz_set_schedules WHERE quiz_set_id = ?`
  )
    .bind(setId)
    .run();

  try {
    await getScheduler(c.env).reloadQuizSetSchedule(setId);
  } catch (error) {
    console.warn(
      "Failed to reload quiz set schedule after delete:",
      error instanceof Error ? error.message : error
    );
  }

  await emitQuizSetModified(c.env, setId, "set_schedule_deleted", {});

  return c.json({ success: true });
});

// POST /api/quiz-sets/:id/schedule/toggle - Enable/disable schedule
quizSets.post(
  "/:id/schedule/toggle",
  zValidator("json", toggleScheduleRequestSchema),
  async (c) => {
    const setId = c.req.param("id");
    const body = c.req.valid("json");
    const now = Math.floor(Date.now() / 1000);

    // Check ownership
    const existing = await c.env.DB.prepare(
      `SELECT id FROM quiz_sets WHERE id = ?`
    )
      .bind(setId)
      .first();

    if (!existing) {
      return c.json({ error: "Quiz set not found" }, 404);
    }

    const result = await c.env.DB.prepare(
      `UPDATE quiz_set_schedules SET is_enabled = ?, updated_at = ? WHERE quiz_set_id = ?`
    )
      .bind(body.isEnabled ? 1 : 0, now, setId)
      .run();

    if (!result.meta?.changes) {
      return c.json({ error: "Schedule not found" }, 404);
    }

    const scheduleRow = await c.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
    )
      .bind(setId)
      .first<QuizSetScheduleRow>();

    try {
      await getScheduler(c.env).reloadQuizSetSchedule(setId);
    } catch (error) {
      console.warn(
        "Failed to reload quiz set schedule after toggle:",
        error instanceof Error ? error.message : error
      );
    }

    await emitQuizSetModified(c.env, setId, "set_schedule_toggled", {
      isEnabled: body.isEnabled,
    });

    return c.json({ schedule: mapScheduleRowToResponse(scheduleRow!) });
  }
);

export { quizSets as quizSetsRoutes };

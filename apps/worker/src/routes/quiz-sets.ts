import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import type { Env } from "../types.js";
import {
  createQuizSetRequestSchema,
  updateQuizSetRequestSchema,
  addQuizSetItemRequestSchema,
  updateQuizSetItemRequestSchema,
  reorderQuizSetItemsRequestSchema,
  quizSetScheduleRequestSchema,
  toggleScheduleRequestSchema,
} from "@mcqs/shared";
import type {
  QuizSetItem,
  QuizSetSchedule,
  QuizSetRun,
  QuizSetRunItem,
  QuizSetListItem,
  QuizSetWithSchedule,
} from "@mcqs/shared";
import { triggerQuizSetGeneration } from "../services/quiz-set-generator.js";
import { getScheduler } from "../services/scheduler.js";

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
  difficulty: string;
  styles: string;
  question_count: number;
  era: string | null;
  enable_current_affairs: number;
  current_affairs_theme: string | null;
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
    difficulty: row.difficulty as QuizSetItem["difficulty"],
    styles: JSON.parse(row.styles) as QuizSetItem["styles"],
    questionCount: row.question_count,
    enableCurrentAffairs: row.enable_current_affairs === 1,
    currentAffairsTheme: row.current_affairs_theme || undefined,
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
          `INSERT INTO quiz_set_items (id, quiz_set_id, sequence_number, subject, theme, difficulty, styles, question_count, era, enable_current_affairs, current_affairs_theme, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            itemId,
            setId,
            i + 1,
            item.subject,
            item.theme || null,
            item.difficulty,
            JSON.stringify(item.styles),
            item.questionCount,
            "current", // Always use current era
            1, // ALWAYS enabled
            item.currentAffairsTheme || null,
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

    return c.json(quizSet, 201);
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
      `INSERT INTO quiz_set_items (id, quiz_set_id, sequence_number, subject, theme, difficulty, styles, question_count, era, enable_current_affairs, current_affairs_theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        setId,
        sequenceNumber,
        body.subject,
        body.theme || null,
        body.difficulty,
        JSON.stringify(body.styles),
        body.questionCount,
        "current", // Always use current era
        1, // ALWAYS enabled
        body.currentAffairsTheme || null,
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
      `SELECT qsi.id FROM quiz_set_items qsi
       WHERE qsi.id = ? AND qsi.quiz_set_id = ?`
    )
      .bind(itemId, setId)
      .first();

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
    if (body.difficulty !== undefined) {
      updates.push("difficulty = ?");
      values.push(body.difficulty);
    }
    if (body.styles !== undefined) {
      updates.push("styles = ?");
      values.push(JSON.stringify(body.styles));
    }
    if (body.questionCount !== undefined) {
      updates.push("question_count = ?");
      values.push(body.questionCount);
    }
    if (body.enableCurrentAffairs !== undefined) {
      updates.push("enable_current_affairs = ?");
      values.push(1); // ALWAYS force enabled
    }
    if (body.currentAffairsTheme !== undefined) {
      updates.push("current_affairs_theme = ?");
      values.push(body.currentAffairsTheme || null);
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

    return c.json({ schedule: mapScheduleRowToResponse(scheduleRow!) });
  }
);

export { quizSets as quizSetsRoutes };

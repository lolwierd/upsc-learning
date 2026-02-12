/* global URL, AbortSignal */

import { nanoid } from "nanoid";
import type {
  QuizSetNotifier,
  QuizSetNotifierEventType,
  QuizSetNotifierProvider,
  QuizSetRunTriggerType,
} from "@mcqs/shared";
import type { Env } from "../types.js";

export const QUIZ_SET_NOTIFIER_EVENT_TYPES: QuizSetNotifierEventType[] = [
  "quiz_set.modified",
  "quiz_set.generation.started",
  "quiz_set.generation.completed",
  "quiz_set.generation.partial",
  "quiz_set.generation.failed",
  "quiz_set.generation.item_failed",
];

type NotificationDestinationRow = {
  id: string;
  scope_id: string;
  provider: string;
  label: string | null;
  target_url: string;
  events: string;
  is_enabled: number;
  created_at: number;
  updated_at: number;
};

type QuizSetSummaryRow = {
  id: string;
  name: string;
};

type RunSummaryRow = {
  run_id: string;
  quiz_set_id: string;
  quiz_set_name: string;
  status: string;
  trigger_type: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  started_at: number;
  completed_at: number | null;
  error: string | null;
};

type RunItemMetricRow = {
  run_item_id: string;
  run_item_status: string;
  run_item_error: string | null;
  quiz_id: string | null;
  sequence_number: number;
  subject: string;
  theme: string | null;
  question_count: number;
  metric_id: string | null;
  metric_status: string | null;
  model: string | null;
  fact_check_model: string | null;
  requested_count: number | null;
  returned_count: number | null;
  total_duration_ms: number | null;
  generation_duration_ms: number | null;
  fact_check_duration_ms: number | null;
  usage_total_tokens: number | null;
  usage_prompt_tokens: number | null;
  usage_completion_tokens: number | null;
  dedup_filtered_count: number | null;
  emergency_no_dedupe_accepted_count: number | null;
  regeneration_attempts_used: number | null;
  emergency_regeneration_attempts_used: number | null;
  generation_call_count: number | null;
  initial_generation_call_count: number | null;
  regeneration_call_count: number | null;
  emergency_regeneration_call_count: number | null;
  grounding_source_count: number | null;
};

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username?: string;
  embeds: DiscordEmbed[];
}

export type QuizSetNotifierEvent =
  | {
    type: "quiz_set.modified";
    quizSetId: string;
    action: string;
    details?: Record<string, unknown>;
  }
  | {
    type: "quiz_set.generation.started";
    quizSetId: string;
    runId: string;
    triggerType: QuizSetRunTriggerType;
    scheduleId?: string | null;
  }
  | {
    type: "quiz_set.generation.completed" | "quiz_set.generation.partial" | "quiz_set.generation.failed";
    quizSetId: string;
    runId: string;
    triggerType: QuizSetRunTriggerType;
  }
  | {
    type: "quiz_set.generation.item_failed";
    quizSetId: string;
    runId: string;
    runItemId: string;
    subject: string;
    theme?: string | null;
    questionCount: number;
    error: string;
  };

type NotifierDestination = {
  id: string;
  quizSetId: string;
  provider: QuizSetNotifierProvider;
  label: string | null;
  targetUrl: string;
  events: QuizSetNotifierEventType[];
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
};

function normalizeEvents(input: unknown): QuizSetNotifierEventType[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(QUIZ_SET_NOTIFIER_EVENT_TYPES);
  const events = input.filter((value): value is QuizSetNotifierEventType => {
    return typeof value === "string" && allowed.has(value);
  });
  return [...new Set(events)];
}

function parseEventsJson(events: string): QuizSetNotifierEventType[] {
  try {
    const parsed = JSON.parse(events) as unknown;
    return normalizeEvents(parsed);
  } catch {
    return [];
  }
}

function maskTargetUrl(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    const pathname = parsed.pathname || "/";
    const tail = pathname.length > 16 ? pathname.slice(-16) : pathname;
    return `${parsed.origin}${tail}`;
  } catch {
    const tail = targetUrl.length > 24 ? targetUrl.slice(-24) : targetUrl;
    return `***${tail}`;
  }
}

function rowToNotifier(row: NotificationDestinationRow): QuizSetNotifier {
  return {
    id: row.id,
    quizSetId: row.scope_id,
    provider: row.provider as QuizSetNotifierProvider,
    label: row.label || undefined,
    targetUrlMasked: maskTargetUrl(row.target_url),
    isEnabled: row.is_enabled === 1,
    events: parseEventsJson(row.events),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDestination(row: NotificationDestinationRow): NotifierDestination {
  return {
    id: row.id,
    quizSetId: row.scope_id,
    provider: row.provider as QuizSetNotifierProvider,
    label: row.label,
    targetUrl: row.target_url,
    events: parseEventsJson(row.events),
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeBaseUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function firstCorsOrigin(env: Env): string | null {
  const raw = env.CORS_ORIGIN;
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function joinUrl(base: string | null, path: string): string | null {
  if (!base) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function formatDurationMs(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return "n/a";
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function numberOrZero(value: number | null): number {
  return value ?? 0;
}

function clampText(input: string, max = 350): string {
  const value = input.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function stringifyDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function getQuizSetSummary(env: Env, quizSetId: string): Promise<QuizSetSummaryRow | null> {
  return env.DB.prepare(`SELECT id, name FROM quiz_sets WHERE id = ? LIMIT 1`)
    .bind(quizSetId)
    .first<QuizSetSummaryRow>();
}

async function getRunSummary(env: Env, runId: string): Promise<RunSummaryRow | null> {
  return env.DB.prepare(
    `SELECT
       qsr.id AS run_id,
       qsr.quiz_set_id,
       qs.name AS quiz_set_name,
       qsr.status,
       qsr.trigger_type,
       qsr.total_items,
       qsr.completed_items,
       qsr.failed_items,
       qsr.started_at,
       qsr.completed_at,
       qsr.error
     FROM quiz_set_runs qsr
     JOIN quiz_sets qs ON qs.id = qsr.quiz_set_id
     WHERE qsr.id = ?
     LIMIT 1`
  )
    .bind(runId)
    .first<RunSummaryRow>();
}

async function getRunItemsWithMetrics(env: Env, runId: string): Promise<RunItemMetricRow[]> {
  const result = await env.DB.prepare(
    `SELECT
       ri.id AS run_item_id,
       ri.status AS run_item_status,
       ri.error AS run_item_error,
       ri.quiz_id,
       qsi.sequence_number,
       qsi.subject,
       qsi.theme,
       qsi.question_count,
       m.id AS metric_id,
       m.status AS metric_status,
       m.model,
       m.fact_check_model,
       m.requested_count,
       m.returned_count,
       m.total_duration_ms,
       m.generation_duration_ms,
       m.fact_check_duration_ms,
       m.usage_total_tokens,
       m.usage_prompt_tokens,
       m.usage_completion_tokens,
       m.dedup_filtered_count,
       m.emergency_no_dedupe_accepted_count,
       m.regeneration_attempts_used,
       m.emergency_regeneration_attempts_used,
       m.generation_call_count,
       m.initial_generation_call_count,
       m.regeneration_call_count,
       m.emergency_regeneration_call_count,
       m.grounding_source_count
     FROM quiz_set_run_items ri
     JOIN quiz_set_items qsi ON qsi.id = ri.quiz_set_item_id
     LEFT JOIN ai_generation_metrics m ON m.id = (
       SELECT am.id
       FROM ai_generation_metrics am
       WHERE am.quiz_id = ri.quiz_id
       ORDER BY am.created_at DESC
       LIMIT 1
     )
     WHERE ri.run_id = ?
     ORDER BY qsi.sequence_number ASC`
  )
    .bind(runId)
    .all<RunItemMetricRow>();

  return result.results;
}

function getStatusColor(type: QuizSetNotifierEventType): number {
  switch (type) {
    case "quiz_set.modified":
      return 0x3b82f6;
    case "quiz_set.generation.started":
      return 0xf59e0b;
    case "quiz_set.generation.completed":
      return 0x16a34a;
    case "quiz_set.generation.partial":
      return 0xf59e0b;
    case "quiz_set.generation.failed":
    case "quiz_set.generation.item_failed":
      return 0xdc2626;
    default:
      return 0x6b7280;
  }
}

function buildEventTitle(type: QuizSetNotifierEventType): string {
  switch (type) {
    case "quiz_set.modified":
      return "Quiz Set Modified";
    case "quiz_set.generation.started":
      return "Quiz Set Generation Started";
    case "quiz_set.generation.completed":
      return "Quiz Set Generation Completed";
    case "quiz_set.generation.partial":
      return "Quiz Set Generation Partial";
    case "quiz_set.generation.failed":
      return "Quiz Set Generation Failed";
    case "quiz_set.generation.item_failed":
      return "Quiz Set Item Generation Failed";
    default:
      return "Quiz Set Notification";
  }
}

async function buildDiscordPayload(env: Env, event: QuizSetNotifierEvent): Promise<DiscordWebhookPayload | null> {
  const webBase = normalizeBaseUrl(env.NOTIFICATION_WEB_BASE_URL) || normalizeBaseUrl(firstCorsOrigin(env));
  const apiBase =
    normalizeBaseUrl(env.NOTIFICATION_API_BASE_URL) ||
    normalizeBaseUrl(env.NOTIFICATION_WEB_BASE_URL) ||
    normalizeBaseUrl(firstCorsOrigin(env));

  if (event.type === "quiz_set.modified") {
    const quizSet = await getQuizSetSummary(env, event.quizSetId);
    const setName = quizSet?.name || event.quizSetId;
    const setLink = joinUrl(webBase, `/sets/${event.quizSetId}`);
    const detailLines = Object.entries(event.details || {})
      .map(([k, v]) => `- **${k}**: ${clampText(stringifyDetailValue(v), 220)}`)
      .join("\n");

    const embed: DiscordEmbed = {
      title: buildEventTitle(event.type),
      url: setLink || undefined,
      color: getStatusColor(event.type),
      description: [
        `**Set:** ${setName}`,
        `**Action:** ${event.action}`,
        detailLines || "- No additional details",
      ].join("\n"),
      timestamp: new Date().toISOString(),
    };

    return {
      username: env.NOTIFICATION_DISCORD_USERNAME || "UPSC Notifier",
      embeds: [embed],
    };
  }

  if (event.type === "quiz_set.generation.started") {
    const runSummary = await getRunSummary(env, event.runId);
    const setName = runSummary?.quiz_set_name || event.quizSetId;
    const runLink = joinUrl(webBase, `/sets/${event.quizSetId}/runs/${event.runId}`);
    const embed: DiscordEmbed = {
      title: buildEventTitle(event.type),
      url: runLink || undefined,
      color: getStatusColor(event.type),
      fields: [
        {
          name: "Set",
          value: `${setName}`,
          inline: true,
        },
        {
          name: "Trigger",
          value: event.triggerType,
          inline: true,
        },
        {
          name: "Run ID",
          value: `\`${event.runId}\``,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };
    return {
      username: env.NOTIFICATION_DISCORD_USERNAME || "UPSC Notifier",
      embeds: [embed],
    };
  }

  if (event.type === "quiz_set.generation.item_failed") {
    const runLink = joinUrl(webBase, `/sets/${event.quizSetId}/runs/${event.runId}`);
    const embed: DiscordEmbed = {
      title: buildEventTitle(event.type),
      url: runLink || undefined,
      color: getStatusColor(event.type),
      description: [
        `**Subject:** ${event.subject}`,
        `**Theme:** ${event.theme || "n/a"}`,
        `**Question Count:** ${event.questionCount}`,
        `**Run Item ID:** \`${event.runItemId}\``,
        `**Error:** ${clampText(event.error)}`,
      ].join("\n"),
      fields: [
        {
          name: "Run ID",
          value: `\`${event.runId}\``,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };
    return {
      username: env.NOTIFICATION_DISCORD_USERNAME || "UPSC Notifier",
      embeds: [embed],
    };
  }

  const runSummary = await getRunSummary(env, event.runId);
  if (!runSummary) return null;
  const runItems = await getRunItemsWithMetrics(env, event.runId);

  const aggregateRequested = runItems.reduce((sum, item) => sum + numberOrZero(item.requested_count), 0);
  const aggregateReturned = runItems.reduce((sum, item) => sum + numberOrZero(item.returned_count), 0);
  const aggregateTokens = runItems.reduce((sum, item) => sum + numberOrZero(item.usage_total_tokens), 0);
  const aggregatePromptTokens = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.usage_prompt_tokens),
    0
  );
  const aggregateCompletionTokens = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.usage_completion_tokens),
    0
  );
  const aggregateDurationMs = runItems.reduce((sum, item) => sum + numberOrZero(item.total_duration_ms), 0);
  const aggregateEmergencyNoDedupeAccepted = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.emergency_no_dedupe_accepted_count),
    0
  );
  const aggregateRegenerationAttempts = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.regeneration_attempts_used),
    0
  );
  const aggregateEmergencyAttempts = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.emergency_regeneration_attempts_used),
    0
  );
  const aggregateCallCount = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.generation_call_count),
    0
  );
  const aggregateInitialCallCount = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.initial_generation_call_count),
    0
  );
  const aggregateRegenerationCallCount = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.regeneration_call_count),
    0
  );
  const aggregateEmergencyCallCount = runItems.reduce(
    (sum, item) => sum + numberOrZero(item.emergency_regeneration_call_count),
    0
  );
  const runLink = joinUrl(webBase, `/sets/${runSummary.quiz_set_id}/runs/${runSummary.run_id}`);

  let itemLines = "";
  for (const item of runItems) {
    const promptLink = item.metric_id ? joinUrl(apiBase, `/api/metrics/ai/${item.metric_id}/prompt`) : null;
    const responseLink = item.metric_id
      ? joinUrl(apiBase, `/api/metrics/ai/${item.metric_id}/response`)
      : null;
    const links = promptLink && responseLink ? ` [Prompt](${promptLink}) [Response](${responseLink})` : "";
    const line = [
      `${item.sequence_number}. ${item.subject}${item.theme ? ` (${item.theme})` : ""}`,
      `status=${item.run_item_status}`,
      `count=${item.returned_count ?? 0}/${item.requested_count ?? item.question_count}`,
      `model=${item.model || "n/a"}`,
      `fc=${item.fact_check_model || "n/a"}`,
      `calls=${item.generation_call_count ?? 0} (i${item.initial_generation_call_count ?? 0}/r${item.regeneration_call_count ?? 0}/e${item.emergency_regeneration_call_count ?? 0})`,
      `stageAttempts=r${item.regeneration_attempts_used ?? 0}/e${item.emergency_regeneration_attempts_used ?? 0}`,
      `emergencyNoDedup=${item.emergency_no_dedupe_accepted_count ?? 0}`,
      `dur=${formatDurationMs(item.total_duration_ms)}`,
      `tok=${item.usage_total_tokens ?? 0}`,
      links.trim(),
    ]
      .filter(Boolean)
      .join(" | ");

    if ((itemLines + line).length > 3400) {
      itemLines += "\n... (truncated)";
      break;
    }
    itemLines += `${itemLines ? "\n" : ""}${line}`;
  }

  const embed: DiscordEmbed = {
    title: buildEventTitle(event.type),
    url: runLink || undefined,
    color: getStatusColor(event.type),
    fields: [
      {
        name: "Set",
        value: runSummary.quiz_set_name,
        inline: true,
      },
      {
        name: "Trigger",
        value: runSummary.trigger_type,
        inline: true,
      },
      {
        name: "Run ID",
        value: `\`${runSummary.run_id}\``,
        inline: false,
      },
      {
        name: "Items",
        value: `total=${runSummary.total_items}, completed=${runSummary.completed_items}, failed=${runSummary.failed_items}`,
        inline: false,
      },
      {
        name: "Counts",
        value: `requested=${aggregateRequested}, returned=${aggregateReturned}`,
        inline: true,
      },
      {
        name: "Tokens",
        value: `total=${aggregateTokens}, prompt=${aggregatePromptTokens}, completion=${aggregateCompletionTokens}`,
        inline: true,
      },
      {
        name: "Duration",
        value: formatDurationMs(aggregateDurationMs),
        inline: true,
      },
      {
        name: "Emergency No-Dedupe",
        value: `accepted=${aggregateEmergencyNoDedupeAccepted}, attempts=${aggregateEmergencyAttempts}, calls=${aggregateEmergencyCallCount}`,
        inline: false,
      },
      {
        name: "Generation Calls",
        value: `total=${aggregateCallCount}, initial=${aggregateInitialCallCount}, regeneration=${aggregateRegenerationCallCount}, emergency=${aggregateEmergencyCallCount}`,
        inline: false,
      },
      {
        name: "Stage Attempts",
        value: `regeneration=${aggregateRegenerationAttempts}, emergency=${aggregateEmergencyAttempts}`,
        inline: false,
      },
    ],
    description: itemLines || "No item-level metrics available.",
    timestamp: new Date().toISOString(),
  };

  if (runSummary.error) {
    embed.fields?.push({
      name: "Run Error",
      value: clampText(runSummary.error),
      inline: false,
    });
  }

  return {
    username: env.NOTIFICATION_DISCORD_USERNAME || "UPSC Notifier",
    embeds: [embed],
  };
}

async function sendDiscordWebhook(targetUrl: string, payload: DiscordWebhookPayload): Promise<void> {
  const timeoutSignal =
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(5000)
      : undefined;
  const response = await globalThis.fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord webhook failed (${response.status}): ${body}`);
  }
}

async function getActiveDestinations(
  env: Env,
  quizSetId: string,
  eventType: QuizSetNotifierEventType
): Promise<NotifierDestination[]> {
  const result = await env.DB.prepare(
    `SELECT id, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at
     FROM notification_destinations
     WHERE scope_type = 'quiz_set' AND scope_id = ? AND is_enabled = 1
     ORDER BY created_at ASC`
  )
    .bind(quizSetId)
    .all<NotificationDestinationRow>();

  return result.results
    .map(rowToDestination)
    .filter((row) => row.events.includes(eventType));
}

export async function emitQuizSetNotifierEvent(env: Env, event: QuizSetNotifierEvent): Promise<void> {
  const destinations = await getActiveDestinations(env, event.quizSetId, event.type);
  if (destinations.length === 0) return;

  for (const destination of destinations) {
    try {
      if (destination.provider !== "discord_webhook") {
        console.warn(`Unsupported notifier provider: ${destination.provider}`);
        continue;
      }

      const payload = await buildDiscordPayload(env, event);
      if (!payload) {
        console.warn(`Skipping notifier ${destination.id}: payload generation returned null`);
        continue;
      }
      await sendDiscordWebhook(destination.targetUrl, payload);
    } catch (error) {
      console.error(`Notifier ${destination.id} failed for event ${event.type}:`, error);
    }
  }
}

export async function listQuizSetNotifiers(env: Env, quizSetId: string): Promise<QuizSetNotifier[]> {
  const result = await env.DB.prepare(
    `SELECT id, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at
     FROM notification_destinations
     WHERE scope_type = 'quiz_set' AND scope_id = ?
     ORDER BY created_at DESC`
  )
    .bind(quizSetId)
    .all<NotificationDestinationRow>();

  return result.results.map(rowToNotifier);
}

export async function createQuizSetNotifier(
  env: Env,
  params: {
    quizSetId: string;
    provider: QuizSetNotifierProvider;
    label?: string;
    targetUrl: string;
    isEnabled: boolean;
    events: QuizSetNotifierEventType[];
  }
): Promise<QuizSetNotifier> {
  const now = Math.floor(Date.now() / 1000);
  const id = nanoid();
  const events = normalizeEvents(params.events);
  const targetUrl = params.targetUrl.trim();
  if (!targetUrl) {
    throw new Error("Target URL cannot be empty");
  }

  await env.DB.prepare(
    `INSERT INTO notification_destinations
      (id, user_id, scope_type, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at)
     VALUES (?, ?, 'quiz_set', ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      "public",
      params.quizSetId,
      params.provider,
      params.label || null,
      targetUrl,
      JSON.stringify(events),
      params.isEnabled ? 1 : 0,
      now,
      now
    )
    .run();

  const created = await env.DB.prepare(
    `SELECT id, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at
     FROM notification_destinations
     WHERE id = ?
     LIMIT 1`
  )
    .bind(id)
    .first<NotificationDestinationRow>();

  if (!created) {
    throw new Error("Failed to create notifier");
  }
  return rowToNotifier(created);
}

export async function updateQuizSetNotifier(
  env: Env,
  params: {
    quizSetId: string;
    notifierId: string;
    label?: string;
    targetUrl?: string;
    isEnabled?: boolean;
    events?: QuizSetNotifierEventType[];
  }
): Promise<QuizSetNotifier> {
  const existing = await env.DB.prepare(
    `SELECT target_url
     FROM notification_destinations
     WHERE id = ? AND scope_type = 'quiz_set' AND scope_id = ?
     LIMIT 1`
  )
    .bind(params.notifierId, params.quizSetId)
    .first<{ target_url: string }>();

  if (!existing) {
    throw new Error("Notifier not found");
  }

  const normalizedIncomingTargetUrl =
    params.targetUrl === undefined ? undefined : params.targetUrl.trim();
  if (normalizedIncomingTargetUrl !== undefined && !normalizedIncomingTargetUrl) {
    throw new Error("Target URL cannot be empty");
  }

  const nextTargetUrl = normalizedIncomingTargetUrl ?? existing.target_url.trim();
  if (params.isEnabled === true && !nextTargetUrl) {
    throw new Error("Cannot enable notifier without a target URL");
  }

  const updates: string[] = ["updated_at = ?"];
  const values: Array<string | number | null> = [Math.floor(Date.now() / 1000)];

  if (params.label !== undefined) {
    updates.push("label = ?");
    values.push(params.label || null);
  }
  if (params.targetUrl !== undefined) {
    updates.push("target_url = ?");
    values.push(normalizedIncomingTargetUrl!);
  }
  if (params.isEnabled !== undefined) {
    updates.push("is_enabled = ?");
    values.push(params.isEnabled ? 1 : 0);
  }
  if (params.events !== undefined) {
    updates.push("events = ?");
    values.push(JSON.stringify(normalizeEvents(params.events)));
  }

  values.push(params.notifierId, params.quizSetId);

  const result = await env.DB.prepare(
    `UPDATE notification_destinations
     SET ${updates.join(", ")}
     WHERE id = ? AND scope_type = 'quiz_set' AND scope_id = ?`
  )
    .bind(...values)
    .run();

  if (!result.meta?.changes) throw new Error("Notifier not found");

  const updated = await env.DB.prepare(
    `SELECT id, scope_id, provider, label, target_url, events, is_enabled, created_at, updated_at
     FROM notification_destinations
     WHERE id = ?
     LIMIT 1`
  )
    .bind(params.notifierId)
    .first<NotificationDestinationRow>();

  if (!updated) {
    throw new Error("Notifier not found");
  }
  return rowToNotifier(updated);
}

export async function deleteQuizSetNotifier(
  env: Env,
  quizSetId: string,
  notifierId: string
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM notification_destinations
     WHERE id = ? AND scope_type = 'quiz_set' AND scope_id = ?`
  )
    .bind(notifierId, quizSetId)
    .run();

  return !!result.meta?.changes;
}

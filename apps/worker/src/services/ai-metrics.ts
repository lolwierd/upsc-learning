import type { DatabaseLike } from "../types.js";

export type AiProvider = "gemini" | "openai" | "vertex";
export type AiMetricStatus = "success" | "error";
export type AiParseStrategy = "direct" | "extracted";

export interface AiGenerationMetricInsert {
  id: string;
  quizId?: string | null;
  userId: string;

  provider: AiProvider;
  model: string;
  factCheckModel?: string | null;
  subject: string;
  theme?: string | null;
  difficulty: string;
  stylesJson: string;
  era?: string | null;

  status: AiMetricStatus;
  errorMessage?: string | null;

  requestedCount: number;
  returnedCount: number;
  dedupEnabled: boolean;
  dedupFilteredCount: number;

  validationIsValid?: boolean | null;
  validationInvalidCount?: number | null;
  validationErrorCount?: number | null;
  validationWarningCount?: number | null;
  validationBatchWarningsJson?: string | null;

  parseStrategy?: AiParseStrategy | null;
  promptChars?: number | null;
  responseChars?: number | null;

  totalDurationMs?: number | null;
  generationDurationMs?: number | null;
  factCheckEnabled: boolean;
  factCheckDurationMs?: number | null;
  factCheckCheckedCount?: number | null;
  factCheckIssueCount?: number | null;

  usagePromptTokens?: number | null;
  usageCompletionTokens?: number | null;
  usageTotalTokens?: number | null;

  groundingEnabled?: boolean;
  groundingSourceCount?: number | null;
}

function clampErrorMessage(errorMessage: string, maxLen = 400): string {
  const msg = errorMessage.trim();
  return msg.length > maxLen ? `${msg.slice(0, maxLen)}…` : msg;
}

export async function insertAiGenerationMetric(
  db: DatabaseLike | D1Database,
  metric: AiGenerationMetricInsert
): Promise<void> {
  const query = `
    INSERT INTO ai_generation_metrics (
      id, quiz_id, user_id,
      provider, model, fact_check_model, subject, theme, difficulty, styles, era,
      status, error_message,
      requested_count, returned_count,
      dedup_enabled, dedup_filtered_count,
      validation_is_valid, validation_invalid_count, validation_error_count, validation_warning_count, validation_batch_warnings,
      parse_strategy, prompt_chars, response_chars,
      total_duration_ms, generation_duration_ms,
      fact_check_enabled, fact_check_duration_ms, fact_check_checked_count, fact_check_issue_count,
      usage_prompt_tokens, usage_completion_tokens, usage_total_tokens,
      grounding_enabled, grounding_source_count,
      created_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      unixepoch()
    )
  `;

  await db
    .prepare(query)
    .bind(
      metric.id,
      metric.quizId ?? null,
      metric.userId,

      metric.provider,
      metric.model,
      metric.factCheckModel ?? null,
      metric.subject,
      metric.theme ?? null,
      metric.difficulty,
      metric.stylesJson,
      metric.era ?? null,

      metric.status,
      metric.errorMessage ? clampErrorMessage(metric.errorMessage) : null,

      metric.requestedCount,
      metric.returnedCount,

      metric.dedupEnabled ? 1 : 0,
      metric.dedupFilteredCount,

      metric.validationIsValid === null || metric.validationIsValid === undefined
        ? null
        : metric.validationIsValid
          ? 1
          : 0,
      metric.validationInvalidCount ?? null,
      metric.validationErrorCount ?? null,
      metric.validationWarningCount ?? null,
      metric.validationBatchWarningsJson ?? null,

      metric.parseStrategy ?? null,
      metric.promptChars ?? null,
      metric.responseChars ?? null,

      metric.totalDurationMs ?? null,
      metric.generationDurationMs ?? null,

      metric.factCheckEnabled ? 1 : 0,
      metric.factCheckDurationMs ?? null,
      metric.factCheckCheckedCount ?? null,
      metric.factCheckIssueCount ?? null,

      metric.usagePromptTokens ?? null,
      metric.usageCompletionTokens ?? null,
      metric.usageTotalTokens ?? null,

      metric.groundingEnabled ? 1 : 0,
      metric.groundingSourceCount ?? null
    )
    .run();
}

export interface AiGenerationMetricRow {
  id: string;
  quizId: string | null;
  userId: string;
  provider: AiProvider;
  model: string;
  factCheckModel: string | null;
  subject: string;
  theme: string | null;
  difficulty: string;
  styles: unknown;
  era: string | null;
  status: AiMetricStatus;
  errorMessage: string | null;
  requestedCount: number;
  returnedCount: number;
  dedupEnabled: boolean;
  dedupFilteredCount: number;
  validationIsValid: boolean | null;
  validationInvalidCount: number | null;
  validationErrorCount: number | null;
  validationWarningCount: number | null;
  validationBatchWarnings: unknown;
  parseStrategy: AiParseStrategy | null;
  promptChars: number | null;
  responseChars: number | null;
  totalDurationMs: number | null;
  generationDurationMs: number | null;
  factCheckEnabled: boolean;
  factCheckDurationMs: number | null;
  factCheckCheckedCount: number | null;
  factCheckIssueCount: number | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  groundingEnabled: boolean;
  groundingSourceCount: number | null;
  createdAt: number;
}

function safeJsonParse(input: unknown): unknown {
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function listAiGenerationMetrics(
  db: DatabaseLike | D1Database,
  params: { limit: number; subject?: string; status?: AiMetricStatus }
): Promise<AiGenerationMetricRow[]> {
  const sqlParts: string[] = [
    `SELECT
      id,
      quiz_id,
      user_id,
      provider,
      model,
      fact_check_model,
      subject,
      theme,
      difficulty,
      styles,
      era,
      status,
      error_message,
      requested_count,
      returned_count,
      dedup_enabled,
      dedup_filtered_count,
      validation_is_valid,
      validation_invalid_count,
      validation_error_count,
      validation_warning_count,
      validation_batch_warnings,
      parse_strategy,
      prompt_chars,
      response_chars,
      total_duration_ms,
      generation_duration_ms,
      fact_check_enabled,
      fact_check_duration_ms,
      fact_check_checked_count,
      fact_check_issue_count,
      usage_prompt_tokens,
      usage_completion_tokens,
      usage_total_tokens,
      grounding_enabled,
      grounding_source_count,
      created_at
    FROM ai_generation_metrics
    WHERE 1 = 1`,
  ];
  const bindParams: (string | number)[] = [];

  if (params.subject) {
    sqlParts.push(` AND subject = ?`);
    bindParams.push(params.subject);
  }
  if (params.status) {
    sqlParts.push(` AND status = ?`);
    bindParams.push(params.status);
  }

  sqlParts.push(` ORDER BY created_at DESC LIMIT ?`);
  bindParams.push(params.limit);

  const result = await db.prepare(sqlParts.join("")).bind(...bindParams).all();
  const rows = (result.results ?? []) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    quizId: (r.quiz_id as string) ?? null,
    userId: String(r.user_id),
    provider: r.provider as AiProvider,
    model: String(r.model),
    factCheckModel: (r.fact_check_model as string) ?? null,
    subject: String(r.subject),
    theme: (r.theme as string) ?? null,
    difficulty: String(r.difficulty),
    styles: safeJsonParse(r.styles),
    era: (r.era as string) ?? null,
    status: r.status as AiMetricStatus,
    errorMessage: (r.error_message as string) ?? null,
    requestedCount: Number(r.requested_count),
    returnedCount: Number(r.returned_count),
    dedupEnabled: Number(r.dedup_enabled) === 1,
    dedupFilteredCount: Number(r.dedup_filtered_count),
    validationIsValid:
      r.validation_is_valid === null || r.validation_is_valid === undefined
        ? null
        : Number(r.validation_is_valid) === 1,
    validationInvalidCount:
      r.validation_invalid_count === null || r.validation_invalid_count === undefined
        ? null
        : Number(r.validation_invalid_count),
    validationErrorCount:
      r.validation_error_count === null || r.validation_error_count === undefined
        ? null
        : Number(r.validation_error_count),
    validationWarningCount:
      r.validation_warning_count === null || r.validation_warning_count === undefined
        ? null
        : Number(r.validation_warning_count),
    validationBatchWarnings: safeJsonParse(r.validation_batch_warnings),
    parseStrategy: (r.parse_strategy as AiParseStrategy) ?? null,
    promptChars:
      r.prompt_chars === null || r.prompt_chars === undefined ? null : Number(r.prompt_chars),
    responseChars:
      r.response_chars === null || r.response_chars === undefined ? null : Number(r.response_chars),
    totalDurationMs:
      r.total_duration_ms === null || r.total_duration_ms === undefined
        ? null
        : Number(r.total_duration_ms),
    generationDurationMs:
      r.generation_duration_ms === null || r.generation_duration_ms === undefined
        ? null
        : Number(r.generation_duration_ms),
    factCheckEnabled: Number(r.fact_check_enabled) === 1,
    factCheckDurationMs:
      r.fact_check_duration_ms === null || r.fact_check_duration_ms === undefined
        ? null
        : Number(r.fact_check_duration_ms),
    factCheckCheckedCount:
      r.fact_check_checked_count === null || r.fact_check_checked_count === undefined
        ? null
        : Number(r.fact_check_checked_count),
    factCheckIssueCount:
      r.fact_check_issue_count === null || r.fact_check_issue_count === undefined
        ? null
        : Number(r.fact_check_issue_count),
    usagePromptTokens:
      r.usage_prompt_tokens === null || r.usage_prompt_tokens === undefined
        ? null
        : Number(r.usage_prompt_tokens),
    usageCompletionTokens:
      r.usage_completion_tokens === null || r.usage_completion_tokens === undefined
        ? null
        : Number(r.usage_completion_tokens),
    usageTotalTokens:
      r.usage_total_tokens === null || r.usage_total_tokens === undefined
        ? null
        : Number(r.usage_total_tokens),
    groundingEnabled: Number(r.grounding_enabled) === 1,
    groundingSourceCount:
      r.grounding_source_count === null || r.grounding_source_count === undefined
        ? null
        : Number(r.grounding_source_count),
    createdAt: Number(r.created_at),
  }));
}

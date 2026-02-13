import type { Env } from "../types.js";
import type { GeneratedQuestion, QuestionStyle } from "@mcqs/shared";
import { getPrompt } from "../prompts/index.js";
import {
  validateBatch,
  autoFixQuestion,
  factCheckBatch,
  fixFactCheckIssue,
} from "./validator.js";
import {
  generateFingerprint,
  generateConceptKey,
  calculateTextSimilarity,
  FINGERPRINT_QUERIES,
  CLUSTER_QUERIES,
} from "./deduplication.js";
import { dumpLlmCall, serializeError } from "./llm-dump.js";
import { GENERATED_QUESTION_ARRAY_SCHEMA } from "./structured-output.js";
import { generateVertexStructuredContent } from "./vertex-structured.js";
import {
  enrichQuestionsWithGrounding,
  type GeminiGroundingMetadata,
} from "./grounding.js";

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================
const DEFAULT_MAX_RETRIES = 15;
const DEFAULT_RETRY_DELAY_MS = 2000; // Base delay for exponential backoff
const RATE_LIMIT_RETRY_DELAY_MS = 60000; // 60s for 429 errors

const METADATA_SUBJECTS = [
  "polity",
  "economy",
  "environment",
  "geography",
  "history",
  "science",
  "culture",
] as const;

const METADATA_SUBJECT_SET = new Set<string>(METADATA_SUBJECTS);

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canonicalizeSubjectKey(subject: string): string {
  // UI uses "art_culture" but question metadata uses "culture".
  if (subject === "art_culture") return "culture";
  return subject;
}

function subjectAliases(canonical: string): string[] {
  if (canonical === "culture") return ["culture", "art_culture"];
  return [canonical];
}

function getEffectiveSubjectKey(requestSubject: string, q: GeneratedQuestion): string {
  if (requestSubject === "random") {
    const meta = q.metadata as { subject?: unknown } | undefined;
    if (meta?.subject && typeof meta.subject === "string") {
      const canonical = canonicalizeSubjectKey(meta.subject);
      // If the model returns an unexpected subject label, bucket it under "random"
      // so history is still loadable and dedupe remains effective.
      if (METADATA_SUBJECT_SET.has(canonical)) return canonical;
      return "random";
    }
    return "random";
  }

  return canonicalizeSubjectKey(requestSubject);
}

interface GenerateQuizParams {
  subject: string;
  theme?: string;
  styles: QuestionStyle[];
  count: number;
  apiKey?: string;
  enableFactCheck?: boolean; // Use Gemini Pro to verify facts
  enableDeduplication?: boolean; // Check against previously generated questions
  enableCurrentAffairs?: boolean; // Enable Google Search grounding for current affairs
  currentAffairsTheme?: string; // Optional focus area for current affairs
  excludeTopics?: string[]; // Topics already covered — prompt tells model to avoid these
  regenerationIndex?: number; // 0 = initial, >0 = regeneration call index
  shuffleSeed?: number; // Seed for theme randomization
  temperatureOverride?: number; // Override temperature for this call (used for regen diversity)
  previousSearchQueries?: string[]; // Web search queries from prior calls — model should search differently
}

export interface GenerateQuizMetrics {
  provider: "gemini";
  model: string;
  factCheckModel: string;
  subject: string;
  theme?: string;
  styles: QuestionStyle[];

  requestedCount: number;
  returnedCount: number;
  dedupEnabled: boolean;
  dedupFilteredCount: number;
  emergencyNoDedupeAcceptedCount: number;
  regenerationAttemptsUsed: number;
  emergencyRegenerationAttemptsUsed: number;
  generationCallCount: number;
  initialGenerationCallCount: number;
  regenerationCallCount: number;
  emergencyRegenerationCallCount: number;
  standardReclassifiedCount: number;
  validationIsValid: boolean;
  validationInvalidCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
  validationBatchWarnings: string[];
  parseStrategy: "direct" | "extracted";
  promptChars: number;
  responseChars: number;
  generationDurationMs: number;
  factCheckEnabled: boolean;
  factCheckDurationMs: number | null;
  factCheckCheckedCount: number | null;
  factCheckIssueCount: number | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  // Grounding metrics
  groundingEnabled: boolean;
  groundingSourceCount: number | null;
  // Format distribution metrics
  howManyFormatPercentage: number | null;

  // Prompt logging
  requestPrompt: string | null;
  rawResponse: string | null;
}

interface RetryableError extends Error {
  code?: number | string;
  status?: string;
  cause?: { code?: string };
  isParseFailure?: boolean;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const err = error as RetryableError;

  // Parse failures (empty LLM response)
  if (err.isParseFailure) return true;

  // 429 Rate Limiting (Check properties and message content)
  if (err.code === 429 || err.status === 'RESOURCE_EXHAUSTED') return true;
  if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) return true;
  if (err.message?.includes('Resource exhausted')) return true;
  if (err.message?.includes('Too Many Requests')) return true;

  // Network/Timeout errors
  const cause = err.cause as { code?: string } | undefined;
  if (cause?.code === 'UND_ERR_HEADERS_TIMEOUT') return true;
  if (err.message?.includes('fetch failed')) return true;
  if (err.message?.includes('Headers Timeout')) return true;

  // Transient Vertex AI errors
  if (err.message?.includes('exception posting request')) return true;

  return false;
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const err = error as RetryableError;
  const msg = err.message || '';
  return (
    err.code === 429 ||
    err.status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Resource exhausted')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    baseDelayMs: number;
    rateLimitDelayMs: number;
    operationName: string;
  }
): Promise<T> {
  const { maxRetries, baseDelayMs, rateLimitDelayMs, operationName } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        console.error(`[${operationName}] Non-retryable error on attempt ${attempt + 1}:`, error);
        throw error;
      }

      if (attempt === maxRetries - 1) {
        console.error(`[${operationName}] All ${maxRetries} attempts failed`);
        throw error;
      }

      // Determine delay based on error type
      const delay = isRateLimitError(error)
        ? rateLimitDelayMs * Math.pow(1.5, attempt) // Exponential for rate limits too
        : baseDelayMs * Math.pow(2, attempt); // Exponential backoff

      console.warn(
        `[${operationName}] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. ` +
        `Retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

type DedupHistoryBucket = {
  fingerprints: Set<string>;
  previews: string[]; // question_text_preview (for similarity checks)
  clusters: Map<string, string>; // cluster_hash -> representative_text
};

async function loadDedupHistoryBucket(
  db: D1Database,
  canonicalSubject: string,
  fingerprintLimit: number,
  clusterLimit: number
): Promise<DedupHistoryBucket> {
  const fingerprints = new Set<string>();
  const previews: string[] = [];
  const clusters = new Map<string, string>();

  for (const alias of subjectAliases(canonicalSubject)) {
    try {
      const fpResult = await db
        .prepare(FINGERPRINT_QUERIES.checkExistsBySubject)
        .bind(alias, fingerprintLimit)
        .all();

      for (const row of (fpResult.results ?? []) as Array<{ fingerprint?: unknown; question_text_preview?: unknown }>) {
        if (typeof row.fingerprint === "string") fingerprints.add(row.fingerprint);
        if (typeof row.question_text_preview === "string") previews.push(row.question_text_preview);
      }
    } catch (error) {
      console.warn(`Could not load fingerprints for ${alias}:`, error);
    }

    try {
      const clResult = await db
        .prepare(CLUSTER_QUERIES.loadBySubject)
        .bind(alias, clusterLimit)
        .all();

      for (const row of (clResult.results ?? []) as Array<{ cluster_hash?: unknown; representative_text?: unknown }>) {
        if (typeof row.cluster_hash !== "string") continue;
        if (clusters.has(row.cluster_hash)) continue; // keep newest (query is ordered desc)
        if (typeof row.representative_text === "string") {
          clusters.set(row.cluster_hash, row.representative_text);
        }
      }
    } catch (error) {
      console.warn(`Could not load clusters for ${alias}:`, error);
    }
  }

  return {
    fingerprints,
    previews: [...new Set(previews)],
    clusters,
  };
}

async function loadDedupHistory(
  db: D1Database,
  requestSubject: string,
  fingerprintLimit: number,
  clusterLimit: number
): Promise<Map<string, DedupHistoryBucket>> {
  const buckets = new Map<string, DedupHistoryBucket>();

  if (requestSubject === "random") {
    for (const s of METADATA_SUBJECTS) {
      const bucket = await loadDedupHistoryBucket(db, s, fingerprintLimit, clusterLimit);
      buckets.set(s, bucket);
    }
    // Questions generated under "random" with missing/unknown metadata are stored under subject "random".
    // Load that bucket too so historical dedupe still works for those cases.
    const randomBucket = await loadDedupHistoryBucket(db, "random", fingerprintLimit, clusterLimit);
    buckets.set("random", randomBucket);
    return buckets;
  }

  const canonical = canonicalizeSubjectKey(requestSubject);
  const bucket = await loadDedupHistoryBucket(db, canonical, fingerprintLimit, clusterLimit);
  buckets.set(canonical, bucket);
  return buckets;
}

// Save fingerprints to database
async function saveFingerprints(
  db: D1Database,
  questions: GeneratedQuestion[],
  requestSubject: string,
  theme?: string
): Promise<{ attempted: number; insertErrors: number }> {
  let savedCount = 0;
  let errorCount = 0;

  for (const question of questions) {
    try {
      const subjectKey = getEffectiveSubjectKey(requestSubject, question);
      const fingerprint = generateFingerprint(question);
      await db
        .prepare(FINGERPRINT_QUERIES.insert) // Uses INSERT OR IGNORE
        .bind(
          crypto.randomUUID(),
          fingerprint,
          subjectKey,
          theme || null,
          question.questionText.slice(0, 200),
          null
        )
        .run();
      savedCount++;
    } catch (error) {
      // Log but continue saving other fingerprints
      errorCount++;
      console.warn("Fingerprint insert failed:", error);
    }
  }

  if (errorCount > 0) {
    console.warn(`Saved ${savedCount}/${questions.length} fingerprints (${errorCount} errors)`);
  }

  return { attempted: questions.length, insertErrors: errorCount };
}

async function saveClusters(
  db: D1Database,
  questions: GeneratedQuestion[],
  requestSubject: string
): Promise<{ attempted: number; insertErrors: number }> {
  let savedCount = 0;
  let errorCount = 0;

  for (const question of questions) {
    try {
      const subjectKey = getEffectiveSubjectKey(requestSubject, question);
      const conceptKey = generateConceptKey(question);
      await db
        .prepare(CLUSTER_QUERIES.upsert)
        .bind(
          crypto.randomUUID(),
          // Store concept key as the cluster hash used for future dedupe.
          conceptKey,
          subjectKey,
          question.questionText.slice(0, 500)
        )
        .run();
      savedCount++;
    } catch (error) {
      errorCount++;
      console.warn("Cluster upsert failed:", error);
    }
  }

  if (errorCount > 0) {
    console.warn(`Saved ${savedCount}/${questions.length} clusters (${errorCount} errors)`);
  }

  return { attempted: questions.length, insertErrors: errorCount };
}

// ============================================================================
// TOPIC EXTRACTION FOR EXCLUSION LIST
// ============================================================================

/**
 * Extract a short topic descriptor from a question for the exclusion list.
 * Prefers model-declared topicTag from metadata; falls back to regex extraction.
 */
function extractTopicSummary(question: GeneratedQuestion): string {
  // Prefer model-declared topicTag (from structured output schema)
  const meta = question.metadata as { topicTag?: unknown; subtopicTag?: unknown } | undefined;
  if (meta?.topicTag && typeof meta.topicTag === "string" && meta.topicTag.trim().length > 0) {
    const tag = meta.topicTag.trim().slice(0, 80);
    // Include subtopic for more specificity if available
    if (meta.subtopicTag && typeof meta.subtopicTag === "string" && meta.subtopicTag.trim().length > 0) {
      return `${tag} — ${meta.subtopicTag.trim().slice(0, 40)}`;
    }
    return tag;
  }

  // Fallback: regex extraction from question text
  const text = question.questionText;
  const patterns = [
    /(?:with reference to|in (?:the )?context of|regarding|about)\s+(.+?)(?:,|\.|\?|consider|which)/i,
    /consider the following (?:statements?|pairs?)(?:\s+regarding|\s+about|\s+related to)?\s*(.+?)(?::|\.)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().slice(0, 80);
    }
  }

  // Fallback: take first 80 chars, trimmed to last word boundary
  const fallback = text.slice(0, 80);
  const lastSpace = fallback.lastIndexOf(' ');
  return lastSpace > 20 ? fallback.slice(0, lastSpace) : fallback;
}

/**
 * Build an exclusion list from already-accepted questions.
 */
function buildExcludeTopics(questions: GeneratedQuestion[]): string[] {
  const topics = new Set<string>();
  for (const q of questions) {
    topics.add(extractTopicSummary(q));
  }
  return [...topics];
}

// ============================================================================
// VERTEX AI STRUCTURED OUTPUT GENERATION
// ============================================================================

// Helper function for a single generation call
async function generateQuizCall(
  env: Env,
  params: GenerateQuizParams,
  parentCallId: string,
  callIndex: number
): Promise<{
  questions: GeneratedQuestion[];
  metrics: Partial<GenerateQuizMetrics>;
  rawResponse: string;
  fullPrompt: string; // Combined system + user prompt
  groundingSourceCount?: number;
  groundingMetadata?: GeminiGroundingMetadata;
}> {
  const {
    subject,
    theme,
    styles,
    count,
    enableCurrentAffairs = true,
    currentAffairsTheme,
    excludeTopics,
    regenerationIndex = 0,
    shuffleSeed,
    previousSearchQueries,
  } = params;

  // Use primary generation model for all cases (including grounding)
  const generationModel = env.GENERATION_MODEL || "gemini-3.0-pro";

  // Distribute questions across styles for this call
  const questionsPerStyle = Math.floor(count / styles.length);
  const remainderQuestions = count % styles.length;

  const styleDistribution: { style: QuestionStyle; count: number }[] = styles.map(
    (style, index) => ({
      style,
      count: questionsPerStyle + (index < remainderQuestions ? 1 : 0),
    })
  );

  const prompt = getPrompt({
    subject,
    theme,
    styles: styleDistribution,
    totalCount: count,
    enableCurrentAffairs,
    currentAffairsTheme,
    excludeTopics,
    regenerationIndex,
    shuffleSeed,
    previousSearchQueries,
  });

  const promptChars = prompt.length;

  const currentDate = new Date();
  const currentDateISO = currentDate.toISOString().slice(0, 10);
  const currentDateHuman = currentDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const systemPrompt = `You are a UPSC Civil Services Preliminary Examination expert question generator with deep knowledge of the Indian civil services examination pattern, syllabus, and question standards.

YOUR ROLE:
- Generate questions that match the exact standard of actual UPSC Prelims questions
- Ensure 100% factual accuracy - someone's career depends on this
- Create elimination-proof questions that test genuine knowledge

UPSC EXAM CONTEXT:
- UPSC Prelims has 100 questions worth 200 marks (2 marks each)
- Negative marking: 0.66 marks deducted per wrong answer
- Cut-off typically ranges from 75-100 marks
  - Target mix: ~40% direct factual questions, ~60% pattern-based (statement/match/assertion)
  - Balance statement, match, and assertion styles within the 60%

CRITICAL REQUIREMENTS:
1. FACTUAL ACCURACY: Every fact, date, article number, year MUST be 100% accurate. Cross-reference with NCERT, Laxmikanth, Spectrum, Ramesh Singh.
2. SINGLE CORRECT ANSWER: There must be exactly ONE definitively correct answer.
3. SMART DISTRACTORS: DO NOT use absolute words (only, always, never, all, none) in wrong options - UPSC aspirants know this pattern.
4. EDUCATIONAL EXPLANATIONS: Explain WHY correct answer is right AND why each distractor is wrong.
5. TIME CONTEXT: Today's date is ${currentDateHuman} (UTC date: ${currentDateISO}).
6. CURRENT AFFAIRS FOCUS: When generating current affairs questions or using search, STRICTLY PRIORITY news/events from JANUARY 2025 TO PRESENT (2026). Do NOT use 2023 or 2024 news unless absolutely necessary for historical context. The target exam is UPSC 2026.

OUTPUT REQUIREMENTS:
- Generate exactly ${count} questions.
- Each question must include: questionText, questionType, options, correctOption, explanation.
- questionType must be one of: standard, statement, match, assertion.
- options must be four choices labeled A) through D).
- correctOption must be 0-3 (0=A, 1=B, 2=C, 3=D).
- Do not add extra keys or markdown.

QUESTION TYPE FORMATS:
- STANDARD/FACTUAL: Direct one-line factual stem (no statements), e.g. "The irrigation device called 'Araghatta' was..."
- STATEMENT: "Consider the following statements: 1. ... 2. ... 3. ... How many of the above statements is/are correct?" Options: A) Only one B) Only two C) All three D) None
- ASSERTION-REASON: "Assertion (A): ... Reason (R): ... Which is correct?" Options must be the standard 4 A-R options.
- MATCH: "Match List-I with List-II..." with proper table format and combination options like "A-1, B-2, C-3, D-4"

Generate exactly ${count} questions now.`;

  const fullPrompt = `${systemPrompt}\n\n=== USER PROMPT ===\n\n${prompt}`;

  const generationCallId = crypto.randomUUID();
  const maxTokensBase = Math.min(8000 + count * 400, 32000); // Increased token buffer
  const modelMaxOutputTokens: Record<string, number> = {
    "gemini-2.0-flash": 8192,
    "gemini-2.0-flash-001": 8192,
    "gemini-2.0-flash-exp": 8192,
    "gemini-2.0-flash-lite": 8192,
    "gemini-3-pro-preview": 65536,
    "gemini-3-flash-preview": 65536,
    "gemini-3.0-pro": 65536,
  };
  const maxTokensCap = modelMaxOutputTokens[generationModel] ?? 32000;
  const maxTokens = Math.min(maxTokensBase, maxTokensCap);

  // Parse service account
  let serviceAccount: any;
  try {
    if (env.GCP_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(env.GCP_SERVICE_ACCOUNT);
    } else {
      throw new Error("GCP_SERVICE_ACCOUNT environment variable is not set");
    }
  } catch (e: any) {
    throw new Error(`Failed to load Google Service Account: ${e.message}`);
  }

  const generationStart = Date.now();
  let text = "";
  let usage: any;
  let rawResponse: unknown;
  let generationDurationMs = 0;
  let responseChars = 0;
  let groundingSourceCount = 0;
  let groundingSources: Array<{ uri?: string; title?: string }> = [];
  let groundingMetadata: GeminiGroundingMetadata | undefined;

  try {
    console.log(`[Call ${callIndex}] Starting generation for ${count} questions${enableCurrentAffairs ? " (with NATIVE grounding)" : ""}...`);

    // Determine temperature: use explicit override if provided, else default behavior
    const effectiveTemperature = typeof params.temperatureOverride === "number"
      ? params.temperatureOverride
      : (enableCurrentAffairs ? 1.0 : undefined);

    const vertexResult = await generateVertexStructuredContent({
      serviceAccount,
      model: generationModel,
      systemPrompt,
      userPrompt: prompt,
      maxOutputTokens: maxTokens,
      location: env.GOOGLE_VERTEX_LOCATION || "global",
      responseSchema: GENERATED_QUESTION_ARRAY_SCHEMA,
      enableGrounding: enableCurrentAffairs,
      thinkingLevel: enableCurrentAffairs ? undefined : "high",
      temperature: effectiveTemperature,
    });

    generationDurationMs = Date.now() - generationStart;
    text = vertexResult.text;
    rawResponse = vertexResult.rawResponse;
    responseChars = text.length;
    usage = {
      promptTokens: vertexResult.usage?.promptTokens,
      completionTokens: vertexResult.usage?.completionTokens,
      totalTokens: vertexResult.usage?.totalTokens,
    };

    if (enableCurrentAffairs) {
      console.log(`[Call ${callIndex}] Using Vertex AI with Google Search grounding...`);
      groundingMetadata = vertexResult.groundingMetadata as GeminiGroundingMetadata | undefined;
      const groundingChunks = groundingMetadata?.groundingChunks;
      if (Array.isArray(groundingChunks)) {
        groundingSources = groundingChunks
          .map((chunk) => ({
            uri: chunk?.web?.uri,
            title: chunk?.web?.title,
          }))
          .filter((s) => s.uri || s.title);
        groundingSourceCount = groundingChunks.length;
        console.log(`[Call ${callIndex}] Grounding used ${groundingSourceCount} sources`);

        const searchQueries = groundingMetadata?.webSearchQueries;
        if (searchQueries?.length) {
          console.log(`[Call ${callIndex}] Search queries: ${searchQueries.join(", ")}`);
        }
      } else {
        groundingSourceCount = 0;
        console.warn(`[Call ${callIndex}] No grounding chunks returned - model may not have searched`);
      }
    }

    console.log(`[Call ${callIndex}] Completed in ${generationDurationMs}ms (${responseChars} chars)`);
  } catch (error) {
    console.error(`[Call ${callIndex}] Failed:`, error);

    // Dump failure log
    await dumpLlmCall(env, {
      kind: "generation",
      callId: generationCallId,
      parentCallId,
      model: generationModel,
      provider: "gemini",
      startedAtMs: generationStart,
      durationMs: Date.now() - generationStart,
      request: {
        system: systemPrompt,
        prompt,
        maxTokens,
        metadata: { callIndex, ...params }
      },
      response: {
        text: "",
        error: serializeError(error),
      },
    });

    throw error;
  }

  // Dump success log
  await dumpLlmCall(env, {
    kind: "generation",
    callId: generationCallId,
    parentCallId,
    model: generationModel,
    provider: "gemini",
    startedAtMs: generationStart,
    durationMs: generationDurationMs,
    request: {
      system: systemPrompt,
      prompt,
      maxTokens,
      metadata: { callIndex, ...params }
    },
    response: {
      text,
      usage: {
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
      },
      raw: rawResponse,
      metadata: enableCurrentAffairs
        ? {
          groundingSourceCount,
          groundingSources,
        }
        : undefined,
    },
  });

  return {
    questions: cleanLlmResponse(text),
    metrics: {
      generationDurationMs,
      promptChars: systemPrompt.length + promptChars,
      responseChars,
      usagePromptTokens: usage?.promptTokens,
      usageCompletionTokens: usage?.completionTokens,
      usageTotalTokens: usage?.totalTokens,
    },
    rawResponse: text,
    fullPrompt,
    groundingSourceCount,
    groundingMetadata,
  };
}

function cleanLlmResponse(text: string): GeneratedQuestion[] {
  try {
    // 1. naive try
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed as GeneratedQuestion[];
      }
    } catch {
      // ignore parse failure and try fallback strategies
    }

    // 2. Extract from markdown
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed as GeneratedQuestion[];
        }
      } catch {
        // ignore and try next fallback
      }
    }

    // 3. Try to clean markdown code blocks
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as GeneratedQuestion[];
    }
    return [];
  } catch (error) {
    console.warn("Failed to parse LLM response as JSON:", error);
    return [];
  }
}

export async function generateQuiz(
  env: Env,
  params: GenerateQuizParams
): Promise<{ questions: GeneratedQuestion[]; metrics: GenerateQuizMetrics }> {
  // Use passed apiKey or fall back to env var
  const {
    subject,
    theme,
    styles,
    count,
    enableFactCheck,
    enableDeduplication,
    enableCurrentAffairs,
    currentAffairsTheme,
  } = params;

  // Use primary generation model
  const generationModel = env.GENERATION_MODEL || "gemini-3.0-pro";
  const factCheckModel = env.FACT_CHECK_MODEL || "gemini-3-flash-preview";
  const overallCallId = crypto.randomUUID();
  const groundingEnabled = !!enableCurrentAffairs; // Force enable if requested (ignoring env var)

  const dedupHistoryLimit = clampNumber(parseIntEnv(env.DEDUP_HISTORY_LIMIT, 600), 0, 5000);
  const dedupClusterLimit = clampNumber(parseIntEnv(env.DEDUP_CLUSTER_LIMIT, 600), 0, 5000);
  const dedupHistorySimThreshold = clampNumber(parseFloatEnv(env.DEDUP_HISTORY_SIM_THRESHOLD, 0.62), 0, 1);
  const dedupIntraConfirmThreshold = clampNumber(parseFloatEnv(env.DEDUP_INTRA_CONFIRM_THRESHOLD, 0.50), 0, 1);
  const dedupHistoryConfirmThreshold = clampNumber(parseFloatEnv(env.DEDUP_HISTORY_CONFIRM_THRESHOLD, 0.50), 0, 1);

  // Load history if deduplication is enabled.
  const dedupHistory = new Map<string, DedupHistoryBucket>();
  if (enableDeduplication && env.DB) {
    const loaded = await loadDedupHistory(
      env.DB as any,
      subject,
      dedupHistoryLimit,
      dedupClusterLimit
    );
    for (const [k, v] of loaded.entries()) dedupHistory.set(k, v);
    const fpCount = [...dedupHistory.values()].reduce((s, b) => s + b.fingerprints.size, 0);
    console.log(`Loaded ${fpCount} existing fingerprints for dedupe (${subject})`);
  }

  console.log(`Starting single-call generation for ${count} questions`);
  const overallStart = Date.now();

  // Stable seed for theme randomization — changes per quiz but deterministic within a quiz
  const shuffleSeed = Math.floor(Math.random() * 2147483647);

  // Get retry config from env or use defaults
  const maxRetries = parseInt(env.LLM_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10);
  const baseDelayMs = parseInt(env.LLM_RETRY_DELAY_MS || String(DEFAULT_RETRY_DELAY_MS), 10);
  // Optional temperature override for regeneration calls
  const regenTemperature = env.REGENERATION_TEMPERATURE != null
    ? parseFloatEnv(env.REGENERATION_TEMPERATURE, -1)
    : -1; // -1 means "not configured"
  let generationCallCount = 0;
  let initialGenerationCallCount = 0;
  let regenerationCallCount = 0;
  let emergencyRegenerationCallCount = 0;
  let regenerationAttemptsUsed = 0;
  let emergencyRegenerationAttemptsUsed = 0;
  let emergencyNoDedupeAcceptedCount = 0;

  const singleResult = await retryWithBackoff(
    async () => {
      generationCallCount++;
      initialGenerationCallCount++;
      const result = await generateQuizCall(
        env,
        {
          ...params,
          count,
          enableCurrentAffairs: groundingEnabled,
          currentAffairsTheme,
          shuffleSeed,
          regenerationIndex: 0,
        },
        overallCallId,
        0
      );

      // Treat empty result (parse failure) as retryable error
      if (result.questions.length === 0) {
        const parseError = new Error(
          `Parse failed: LLM returned ${result.rawResponse.length} chars but parsed to 0 questions`
        );
        (parseError as any).isParseFailure = true;
        throw parseError;
      }

      return result;
    },
    {
      maxRetries,
      baseDelayMs,
      rateLimitDelayMs: RATE_LIMIT_RETRY_DELAY_MS,
      operationName: `Quiz Generation (${subject}/${theme || 'no-theme'})`,
    }
  );

  // Merge results
  let allQuestions: GeneratedQuestion[] = [];
  let totalPromptChars = 0;
  let totalResponseChars = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalGroundingSources = 0;

  // Accumulate web search queries across calls for search diversity feedback
  const accumulatedSearchQueries: string[] = [];
  const initialSearchQueries = singleResult.groundingMetadata?.webSearchQueries;
  if (initialSearchQueries?.length) {
    accumulatedSearchQueries.push(...initialSearchQueries);
  }

  allQuestions = allQuestions.concat(singleResult.questions);
  totalPromptChars += singleResult.metrics.promptChars || 0;
  totalResponseChars += singleResult.metrics.responseChars || 0;
  totalPromptTokens += singleResult.metrics.usagePromptTokens || 0;
  totalCompletionTokens += singleResult.metrics.usageCompletionTokens || 0;
  totalTokens += singleResult.metrics.usageTotalTokens || 0;
  totalGroundingSources += singleResult.groundingSourceCount || 0;

  console.log(`Initial generation produced ${allQuestions.length}/${count} questions before filtering`);

  const normalizeQuestions = (questions: GeneratedQuestion[], offset: number) =>
    questions.map((q, i) => ({
      questionText: q.questionText || `Question ${offset + i + 1}`,
      questionType: q.questionType || "standard",
      options: Array.isArray(q.options) && q.options.length === 4
        ? q.options
        : ["A) Option A", "B) Option B", "C) Option D", "D) Option D"],
      correctOption: typeof q.correctOption === "number" && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption
        : 0,
      explanation: q.explanation || "No explanation provided.",
      metadata: q.metadata,
    }));

  // Normalize questions
  const normalizedQuestions = normalizeQuestions(allQuestions.slice(0, count), 0);

  // Auto-fix
  const fixedQuestions = normalizedQuestions.map(autoFixQuestion);

  const hasStatementList = (text: string): boolean => {
    const firstStatement = /(?:^|\s)(?:1\.|1\)|statement\s*-?\s*i\b)/i.test(text);
    const secondStatement = /(?:^|\s)(?:2\.|2\)|statement\s*-?\s*ii\b)/i.test(text);
    return firstStatement && secondStatement;
  };

  const isInvalidStatementQuestion = (question: GeneratedQuestion): boolean =>
    question.questionType === "statement" && !hasStatementList(question.questionText);

  let invalidStatementCount = 0;
  let dedupFilteredCount = 0;
  let standardReclassifiedCount = 0;

  const dedupReasonCounts = {
    fingerprint: 0,
    intraConcept: 0,
    historyConcept: 0,
    historySimilarity: 0,
  };
  type DedupRejectReason = keyof typeof dedupReasonCounts;

  type RuntimeDedupBucket = {
    seenFingerprints: Set<string>;
    seenConceptKeys: Set<string>;
    conceptRepText: Map<string, string>; // conceptKey -> representative questionText (within this quiz)
    historyPreviews: string[];
    historyClusters: Map<string, string>; // conceptKey -> representative_text (history)
  };

  const runtimeBuckets = new Map<string, RuntimeDedupBucket>();

  const getRuntimeBucket = (subjectKey: string): RuntimeDedupBucket => {
    const canonical = canonicalizeSubjectKey(subjectKey);
    const existing = runtimeBuckets.get(canonical);
    if (existing) return existing;

    const history = dedupHistory.get(canonical);
    const bucket: RuntimeDedupBucket = {
      seenFingerprints: new Set(history?.fingerprints ?? []),
      seenConceptKeys: new Set(),
      conceptRepText: new Map(),
      historyPreviews: history?.previews ?? [],
      historyClusters: history?.clusters ?? new Map(),
    };
    runtimeBuckets.set(canonical, bucket);
    return bucket;
  };

  const checkAndAccept = (question: GeneratedQuestion): { accepted: boolean; reason?: DedupRejectReason } => {
    const effectiveSubject = getEffectiveSubjectKey(subject, question);
    const bucket = getRuntimeBucket(effectiveSubject);

    const fingerprint = generateFingerprint(question);
    if (bucket.seenFingerprints.has(fingerprint)) {
      return { accepted: false, reason: "fingerprint" };
    }

    const conceptKey = generateConceptKey(question);
    if (bucket.seenConceptKeys.has(conceptKey)) {
      const rep = bucket.conceptRepText.get(conceptKey);
      if (rep && calculateTextSimilarity(question.questionText, rep) >= dedupIntraConfirmThreshold) {
        return { accepted: false, reason: "intraConcept" };
      }
    }

    const historyRep = bucket.historyClusters.get(conceptKey);
    if (historyRep && calculateTextSimilarity(question.questionText, historyRep) >= dedupHistoryConfirmThreshold) {
      return { accepted: false, reason: "historyConcept" };
    }

    for (const preview of bucket.historyPreviews) {
      if (calculateTextSimilarity(question.questionText, preview) >= dedupHistorySimThreshold) {
        return { accepted: false, reason: "historySimilarity" };
      }
    }

    // Accept: update runtime state
    bucket.seenFingerprints.add(fingerprint);
    bucket.seenConceptKeys.add(conceptKey);
    if (!bucket.conceptRepText.has(conceptKey)) {
      bucket.conceptRepText.set(conceptKey, question.questionText);
    }
    return { accepted: true };
  };

  const forceAcceptAndTrack = (question: GeneratedQuestion) => {
    const effectiveSubject = getEffectiveSubjectKey(subject, question);
    const bucket = getRuntimeBucket(effectiveSubject);
    const fingerprint = generateFingerprint(question);
    const conceptKey = generateConceptKey(question);
    bucket.seenFingerprints.add(fingerprint);
    bucket.seenConceptKeys.add(conceptKey);
    if (!bucket.conceptRepText.has(conceptKey)) {
      bucket.conceptRepText.set(conceptKey, question.questionText);
    }
  };

  const shouldForceAccept = (reason: DedupRejectReason | undefined, relaxationLevel: number): boolean => {
    if (!reason || relaxationLevel <= 0) return false;
    if (relaxationLevel === 1) return reason === "historySimilarity";
    if (relaxationLevel === 2) {
      return reason === "historySimilarity" || reason === "historyConcept" || reason === "intraConcept";
    }
    return true;
  };

  // Track topics from rejected duplicates so we can tell the model to avoid them too
  const rejectedDuplicateTopics: string[] = [];

  // Deduplication and early validation pass (keeps invalid statement questions out of runtime state)
  let finalQuestions: GeneratedQuestion[] = [];
  for (const question of fixedQuestions) {
    if (isInvalidStatementQuestion(question)) {
      invalidStatementCount++;
      continue;
    }

    // Reclassify statement-like standard questions (before dedupe).
    if (question.questionType === "standard") {
      const text = question.questionText.toLowerCase();
      if (
        text.includes("consider the following statements") ||
        text.includes("how many of the above") ||
        text.includes("which of the statements")
      ) {
        if (hasStatementList(question.questionText)) {
          question.questionType = "statement";
          standardReclassifiedCount++;
        } else {
          invalidStatementCount++;
          continue;
        }
      }
    }

    if (enableDeduplication) {
      const result = checkAndAccept(question);
      if (!result.accepted) {
        dedupFilteredCount++;
        if (result.reason) dedupReasonCounts[result.reason] += 1;
        // Collect topic from rejected duplicate so model knows to avoid it
        rejectedDuplicateTopics.push(extractTopicSummary(question));
        continue;
      }
    }

    finalQuestions.push(question);
  }

  if (standardReclassifiedCount > 0) {
    console.warn(`Reclassified ${standardReclassifiedCount} standard questions as statement style`);
  }
  if (invalidStatementCount > 0) {
    console.warn(`Filtered ${invalidStatementCount} statement questions missing statements`);
  }
  if (enableDeduplication && dedupFilteredCount > 0) {
    console.warn(
      `Deduplicated ${dedupFilteredCount} question(s) ` +
      `(fingerprint=${dedupReasonCounts.fingerprint}, intraConcept=${dedupReasonCounts.intraConcept}, ` +
      `historyConcept=${dedupReasonCounts.historyConcept}, historySimilarity=${dedupReasonCounts.historySimilarity})`
    );
  }

  // Reduce factual minimum by reclassified count: the model attempted to generate standard
  // questions but embedded statement patterns. They're still valid questions in the quiz,
  // just re-typed. Don't penalize the factual quota for the model's labeling error.
  const rawFactualMinimum = Math.round(count * 0.40);
  const factualMinimum = Math.max(rawFactualMinimum - standardReclassifiedCount, 0);
  if (standardReclassifiedCount > 0 && factualMinimum < rawFactualMinimum) {
    console.log(
      `Factual minimum reduced from ${rawFactualMinimum} to ${factualMinimum} ` +
      `(${standardReclassifiedCount} reclassified questions counted toward quota)`
    );
  }
  const getFactualCount = () =>
    finalQuestions.filter(q => q.questionType === "standard").length;
  const getMissingCount = () => Math.max(count - finalQuestions.length, 0);
  const getMissingFactualCount = () => Math.max(factualMinimum - getFactualCount(), 0);
  const shouldRegenerate = () => getMissingCount() > 0 || getMissingFactualCount() > 0;

  if (shouldRegenerate()) {
    let remaining = Math.max(getMissingCount(), getMissingFactualCount());
    let regenerationIndex = 1;
    const regenerationLimit = clampNumber(parseIntEnv(env.REGENERATION_MAX_ATTEMPTS, 18), 1, 200);
    const dedupOversampleFactor = 2;
    const dedupOversampleCap = 24;
    let dedupRelaxationLevel = 0;
    let stalledAttempts = 0;

    while (remaining > 0 && regenerationIndex <= regenerationLimit) {
      regenerationAttemptsUsed++;
      const factualNeededNow = getMissingFactualCount();
      const factualOnly = factualNeededNow > 0;
      const reason = factualOnly ? "to meet factual minimum" : "to fill filtered shortfall";
      const requestCount = enableDeduplication
        ? Math.min(remaining * dedupOversampleFactor, dedupOversampleCap)
        : remaining;

      // Build exclusion list from accepted questions + rejected duplicates
      const currentExcludeTopics = [
        ...buildExcludeTopics(finalQuestions),
        ...rejectedDuplicateTopics,
      ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

      // Disable grounding for factual-only regen: factual questions are pure static
      // and benefit from extended thinking (thinkingLevel: "high") instead of web search
      const regenGrounding = factualOnly ? false : groundingEnabled;

      console.log(
        `Regenerating ${remaining} question(s) ${reason} (attempt ${regenerationIndex}, requesting ${requestCount}, ` +
        `excluding ${currentExcludeTopics.length} topics, grounding=${regenGrounding})...`
      );
      const acceptedBefore = finalQuestions.length;
      const regenerated = await retryWithBackoff(
        async () => {
          generationCallCount++;
          regenerationCallCount++;
          const result = await generateQuizCall(
            env,
            {
              ...params,
              count: requestCount,
              styles: factualOnly ? ["factual"] : params.styles,
              enableCurrentAffairs: regenGrounding,
              currentAffairsTheme,
              excludeTopics: currentExcludeTopics,
              regenerationIndex,
              shuffleSeed,
              previousSearchQueries: accumulatedSearchQueries,
              ...(regenTemperature >= 0 ? { temperatureOverride: regenTemperature } : {}),
            },
            overallCallId,
            regenerationIndex
          );

          if (result.questions.length === 0) {
            const parseError = new Error(
              `Parse failed: LLM returned ${result.rawResponse.length} chars but parsed to 0 questions`
            );
            (parseError as any).isParseFailure = true;
            throw parseError;
          }

          return result;
        },
        {
          maxRetries,
          baseDelayMs,
          rateLimitDelayMs: RATE_LIMIT_RETRY_DELAY_MS,
          operationName: `Quiz Regeneration (${subject}/${theme || 'no-theme'})`,
        }
      );

      // Collect search queries from this regen call for future diversity feedback
      const regenSearchQueries = regenerated.groundingMetadata?.webSearchQueries;
      if (regenSearchQueries?.length) {
        accumulatedSearchQueries.push(...regenSearchQueries);
      }

      totalPromptChars += regenerated.metrics.promptChars || 0;
      totalResponseChars += regenerated.metrics.responseChars || 0;
      totalPromptTokens += regenerated.metrics.usagePromptTokens || 0;
      totalCompletionTokens += regenerated.metrics.usageCompletionTokens || 0;
      totalTokens += regenerated.metrics.usageTotalTokens || 0;
      totalGroundingSources += regenerated.groundingSourceCount || 0;

      const normalizedRegenerated = normalizeQuestions(
        regenerated.questions,
        finalQuestions.length
      );
      const fixedRegenerated = normalizedRegenerated.map(autoFixQuestion);

      for (const question of fixedRegenerated) {
        if (isInvalidStatementQuestion(question)) {
          invalidStatementCount++;
          continue;
        }

        // Reclassify statement-like standard questions (before dedupe).
        if (question.questionType === "standard") {
          const text = question.questionText.toLowerCase();
          if (
            text.includes("consider the following statements") ||
            text.includes("how many of the above") ||
            text.includes("which of the statements")
          ) {
            if (hasStatementList(question.questionText)) {
              question.questionType = "statement";
              standardReclassifiedCount++;
            } else {
              invalidStatementCount++;
              continue;
            }
          }
        }

        if (factualOnly && question.questionType !== "standard") {
          continue;
        }

        if (enableDeduplication) {
          const result = checkAndAccept(question);
          if (!result.accepted) {
            dedupFilteredCount++;
            if (result.reason) dedupReasonCounts[result.reason] += 1;
            // Collect topic from rejected duplicate so model knows to avoid it
            rejectedDuplicateTopics.push(extractTopicSummary(question));
            if (shouldForceAccept(result.reason, dedupRelaxationLevel)) {
              forceAcceptAndTrack(question);
              finalQuestions.push(question);
            }
            continue;
          }
        }

        finalQuestions.push(question);
      }

      remaining = Math.max(getMissingCount(), getMissingFactualCount());
      const acceptedThisAttempt = finalQuestions.length - acceptedBefore;
      if (acceptedThisAttempt === 0) {
        stalledAttempts++;
      } else {
        stalledAttempts = 0;
      }

      if (enableDeduplication) {
        const nextRelaxationLevel = stalledAttempts >= 6 ? 3 : stalledAttempts >= 4 ? 2 : stalledAttempts >= 2 ? 1 : 0;
        if (nextRelaxationLevel !== dedupRelaxationLevel) {
          dedupRelaxationLevel = nextRelaxationLevel;
          if (dedupRelaxationLevel > 0) {
            console.warn(
              `Regeneration is stalled; applying dedupe relaxation level ${dedupRelaxationLevel} ` +
              `(1=historySimilarity, 2=historyConcept/intraConcept, 3=allow all duplicates)`
            );
          }
        }
      }

      regenerationIndex += 1;
    }

    const emergencyFingerprints = new Set<string>();
    // Seed with fingerprints from questions already accepted in the normal phase
    for (const q of finalQuestions) {
      emergencyFingerprints.add(q.questionText.trim().toLowerCase().slice(0, 120));
    }
    const emergencyLimit = clampNumber(parseIntEnv(env.REGENERATION_EMERGENCY_ATTEMPTS, 8), 1, 100);
    let emergencyAttempt = 1;
    while ((getMissingCount() > 0 || getMissingFactualCount() > 0) && emergencyAttempt <= emergencyLimit) {
      emergencyRegenerationAttemptsUsed++;
      const factualNeededNow = getMissingFactualCount();
      const factualOnly = factualNeededNow > 0;
      const requestCount = Math.max(getMissingCount(), getMissingFactualCount());
      // Build exclusion list for emergency too (include rejected topics)
      const emergencyExcludeTopics = [
        ...buildExcludeTopics(finalQuestions),
        ...rejectedDuplicateTopics,
      ].filter((v, i, a) => a.indexOf(v) === i);
      const emergencyGrounding = factualOnly ? false : groundingEnabled;

      console.warn(
        `Emergency regeneration ${emergencyAttempt}/${emergencyLimit}: requesting ${requestCount} question(s) without dedupe ` +
        `(excluding ${emergencyExcludeTopics.length} topics, grounding=${emergencyGrounding})`
      );

      let regenerated: Awaited<ReturnType<typeof generateQuizCall>>;
      try {
        regenerated = await retryWithBackoff(
          async () => {
            generationCallCount++;
            emergencyRegenerationCallCount++;
            const result = await generateQuizCall(
              env,
              {
                ...params,
                count: requestCount,
                styles: factualOnly ? ["factual"] : params.styles,
                enableCurrentAffairs: emergencyGrounding,
                currentAffairsTheme,
                excludeTopics: emergencyExcludeTopics,
                regenerationIndex: 1000 + emergencyAttempt,
                shuffleSeed,
                previousSearchQueries: accumulatedSearchQueries,
                ...(regenTemperature >= 0 ? { temperatureOverride: regenTemperature } : {}),
              },
              overallCallId,
              1000 + emergencyAttempt
            );

            if (result.questions.length === 0) {
              const parseError = new Error(
                `Parse failed: LLM returned ${result.rawResponse.length} chars but parsed to 0 questions`
              );
              (parseError as any).isParseFailure = true;
              throw parseError;
            }

            return result;
          },
          {
            maxRetries,
            baseDelayMs,
            rateLimitDelayMs: RATE_LIMIT_RETRY_DELAY_MS,
            operationName: `Quiz Emergency Regeneration (${subject}/${theme || 'no-theme'})`,
          }
        );
      } catch (error) {
        console.error(`Emergency regeneration attempt ${emergencyAttempt} failed:`, error);
        emergencyAttempt += 1;
        continue;
      }

      // Collect search queries from emergency call
      const emergencySearchQueries = regenerated.groundingMetadata?.webSearchQueries;
      if (emergencySearchQueries?.length) {
        accumulatedSearchQueries.push(...emergencySearchQueries);
      }

      totalPromptChars += regenerated.metrics.promptChars || 0;
      totalResponseChars += regenerated.metrics.responseChars || 0;
      totalPromptTokens += regenerated.metrics.usagePromptTokens || 0;
      totalCompletionTokens += regenerated.metrics.usageCompletionTokens || 0;
      totalTokens += regenerated.metrics.usageTotalTokens || 0;
      totalGroundingSources += regenerated.groundingSourceCount || 0;

      const normalizedRegenerated = normalizeQuestions(
        regenerated.questions,
        finalQuestions.length
      );
      const fixedRegenerated = normalizedRegenerated.map(autoFixQuestion);

      for (const question of fixedRegenerated) {
        if (isInvalidStatementQuestion(question)) {
          invalidStatementCount++;
          continue;
        }

        if (question.questionType === "standard") {
          const text = question.questionText.toLowerCase();
          if (
            text.includes("consider the following statements") ||
            text.includes("how many of the above") ||
            text.includes("which of the statements")
          ) {
            if (hasStatementList(question.questionText)) {
              question.questionType = "statement";
              standardReclassifiedCount++;
            } else {
              invalidStatementCount++;
              continue;
            }
          }
        }

        if (factualOnly && question.questionType !== "standard") {
          continue;
        }

        const fp = `${question.questionText.trim().toLowerCase().slice(0, 120)}`;
        if (emergencyFingerprints.has(fp)) {
          continue;
        }
        emergencyFingerprints.add(fp);
        finalQuestions.push(question);
        emergencyNoDedupeAcceptedCount++;
      }

      emergencyAttempt += 1;
    }

    if (getMissingCount() > 0 || getMissingFactualCount() > 0) {
      const unresolvedCount = getMissingCount();
      const unresolvedFactualCount = getMissingFactualCount();
      throw new Error(
        `Failed to reach required count after regeneration attempts. requested=${count}, accepted=${finalQuestions.length}, missing=${unresolvedCount}, factualMissing=${unresolvedFactualCount}, maxAttempts=${regenerationLimit}, emergencyAttempts=${emergencyLimit}`
      );
    }
  }

  if (finalQuestions.length > count) {
    const factualQuestions = finalQuestions.filter(q => q.questionType === "standard");
    const nonFactualQuestions = finalQuestions.filter(q => q.questionType !== "standard");
    finalQuestions = [...factualQuestions, ...nonFactualQuestions].slice(0, count);
  } else {
    finalQuestions = finalQuestions.slice(0, count);
  }

  console.log(`Finalized ${finalQuestions.length}/${count} questions before fact check`);
  console.log(
    `Generation stages summary: calls(total=${generationCallCount}, initial=${initialGenerationCallCount}, regeneration=${regenerationCallCount}, emergency=${emergencyRegenerationCallCount}), ` +
    `attempts(regeneration=${regenerationAttemptsUsed}, emergency=${emergencyRegenerationAttemptsUsed}), ` +
    `emergencyNoDedupeAccepted=${emergencyNoDedupeAcceptedCount}`
  );

  // Validation
  const validationResult = validateBatch(finalQuestions);

  // Fact Check + Fix
  let factCheckResult = { checkedCount: 0, accurateCount: 0, issues: [] as any[] };
  let factCheckDurationMs = 0;

  if (enableFactCheck && finalQuestions.length > 0) {
    console.log(`Starting fact check for ${finalQuestions.length} questions...`);
    const fcStart = Date.now();
    try {
      factCheckResult = await factCheckBatch(
        finalQuestions,
        "",
        { env, parentCallId: overallCallId, subject, theme }
      );
      factCheckDurationMs = Date.now() - fcStart;
    } catch (e) {
      console.error("Fact check failed:", e);
    }

    if (factCheckResult.issues.length > 0) {
      console.log(`Fact-check flagged ${factCheckResult.issues.length} questions. Attempting fixes...`);
      for (const issue of factCheckResult.issues) {
        const idx = issue.questionIndex;
        const question = finalQuestions[idx];
        if (!question) continue;
        try {
          finalQuestions[idx] = await fixFactCheckIssue(question, issue.result, env);
        } catch (error) {
          console.error("Fact-fix failed for question", idx, error);
        }
      }

      const fcRetryStart = Date.now();
      try {
        const refactored = await factCheckBatch(
          finalQuestions,
          "",
          { env, parentCallId: overallCallId, subject, theme }
        );
        factCheckDurationMs += Date.now() - fcRetryStart;
        factCheckResult = {
          checkedCount: refactored.checkedCount,
          accurateCount: refactored.accurateCount,
          issues: refactored.issues,
        };
      } catch (error) {
        console.error("Fact check retry failed:", error);
      }
    }
  }

  // Enrich questions with grounding metadata
  if (groundingEnabled && finalQuestions.length > 0) {
    finalQuestions = enrichQuestionsWithGrounding(
      finalQuestions,
      singleResult.groundingMetadata
    );
    console.log(`Enriched ${finalQuestions.length} questions with grounding metadata`);
  }

  // Save fingerprints
  if (enableDeduplication && env.DB && finalQuestions.length > 0) {
    // Fire and forget dedupe persistence to save time
    saveFingerprints(env.DB as any, finalQuestions, subject, theme).catch(err =>
      console.error("Background fingerprint save failed:", err)
    );
    saveClusters(env.DB as any, finalQuestions, subject).catch(err =>
      console.error("Background cluster save failed:", err)
    );
  }

  // Calculate howMany percentage
  const howManyCount = finalQuestions.filter(q =>
    q.questionText.toLowerCase().includes("how many")
  ).length;
  const howManyFormatPercentage = finalQuestions.length > 0
    ? Math.round((howManyCount / finalQuestions.length) * 100)
    : 0;

  return {
    questions: finalQuestions,
    metrics: {
      provider: "gemini",
      model: generationModel,
      factCheckModel,
      subject,
      theme,
      styles,
      requestedCount: count,
      returnedCount: finalQuestions.length,
      dedupEnabled: enableDeduplication || false,
      dedupFilteredCount,
      emergencyNoDedupeAcceptedCount,
      regenerationAttemptsUsed,
      emergencyRegenerationAttemptsUsed,
      generationCallCount,
      initialGenerationCallCount,
      regenerationCallCount,
      emergencyRegenerationCallCount,
      standardReclassifiedCount,
      validationIsValid: validationResult.isValid,
      validationInvalidCount: validationResult.invalidQuestions,
      validationErrorCount: validationResult.results.reduce((s, r) => s + r.errors.length, 0),
      validationWarningCount: validationResult.results.reduce((s, r) => s + r.warnings.length, 0),
      validationBatchWarnings: validationResult.batchWarnings,
      parseStrategy: "direct",
      promptChars: totalPromptChars,
      responseChars: totalResponseChars,
      generationDurationMs: Date.now() - overallStart,
      factCheckEnabled: enableFactCheck || false,
      factCheckDurationMs,
      factCheckCheckedCount: factCheckResult.checkedCount,
      factCheckIssueCount: factCheckResult.issues.length,
      usagePromptTokens: totalPromptTokens,
      usageCompletionTokens: totalCompletionTokens,
      usageTotalTokens: totalTokens,
      groundingEnabled,
      groundingSourceCount: totalGroundingSources,
      howManyFormatPercentage,
      requestPrompt: singleResult.fullPrompt,
      rawResponse: singleResult.rawResponse,
    },
  };
}

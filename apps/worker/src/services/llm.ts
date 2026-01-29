import type { Env } from "../types.js";
import type { GeneratedQuestion, QuestionStyle, Difficulty } from "@mcqs/shared";
import { getPrompt } from "../prompts/index.js";
import {
  validateBatch,
  autoFixQuestion,
  factCheckBatch,
  fixFactCheckIssue,
} from "./validator.js";
import {
  generateFingerprint,
  FINGERPRINT_QUERIES,
} from "./deduplication.js";
import { dumpLlmCall, serializeError } from "./llm-dump.js";
import { GENERATED_QUESTION_ARRAY_SCHEMA } from "./structured-output.js";
import { generateVertexStructuredContent } from "./vertex-structured.js";

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================
const DEFAULT_MAX_RETRIES = 15;
const DEFAULT_RETRY_DELAY_MS = 2000; // Base delay for exponential backoff
const RATE_LIMIT_RETRY_DELAY_MS = 60000; // 60s for 429 errors

interface GenerateQuizParams {
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  count: number;
  apiKey?: string;
  enableFactCheck?: boolean; // Use Gemini Pro to verify facts
  enableDeduplication?: boolean; // Check against previously generated questions
  enableCurrentAffairs?: boolean; // Enable Google Search grounding for current affairs
  currentAffairsTheme?: string; // Optional focus area for current affairs
}

export interface GenerateQuizMetrics {
  provider: "gemini";
  model: string;
  factCheckModel: string;
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];

  requestedCount: number;
  returnedCount: number;
  dedupEnabled: boolean;
  dedupFilteredCount: number;
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

// Load existing fingerprints from database for deduplication
async function loadExistingFingerprints(
  db: D1Database,
  subject: string
): Promise<Set<string>> {
  try {
    const result = await db
      .prepare(FINGERPRINT_QUERIES.checkExistsBySubject)
      .bind(subject)
      .all();

    const fingerprints = new Set<string>();
    if (result.results) {
      for (const row of result.results) {
        fingerprints.add((row as { fingerprint: string }).fingerprint);
      }
    }
    return fingerprints;
  } catch (error) {
    console.warn("Could not load fingerprints:", error);
    return new Set();
  }
}

// Save fingerprints to database
async function saveFingerprints(
  db: D1Database,
  questions: GeneratedQuestion[],
  subject: string,
  theme?: string
): Promise<{ attempted: number; insertErrors: number }> {
  let savedCount = 0;
  let errorCount = 0;

  for (const question of questions) {
    try {
      const fingerprint = generateFingerprint(question);
      await db
        .prepare(FINGERPRINT_QUERIES.insert) // Uses INSERT OR IGNORE
        .bind(
          crypto.randomUUID(),
          fingerprint,
          subject,
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
}> {
  const {
    subject,
    theme,
    difficulty,
    styles,
    count,
    enableCurrentAffairs = true,
    currentAffairsTheme,
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
    difficulty,
    styles: styleDistribution,
    totalCount: count,
    enableCurrentAffairs,
    currentAffairsTheme,
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

  try {
    console.log(`[Call ${callIndex}] Starting generation for ${count} questions${enableCurrentAffairs ? " (with NATIVE grounding)" : ""}...`);

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
      temperature: enableCurrentAffairs ? 1.0 : undefined,
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
      const groundingChunks = vertexResult.groundingMetadata?.groundingChunks;
      if (Array.isArray(groundingChunks)) {
        groundingSources = groundingChunks
          .map((chunk) => ({
            uri: chunk?.web?.uri,
            title: chunk?.web?.title,
          }))
          .filter((s) => s.uri || s.title);
        groundingSourceCount = groundingChunks.length;
        console.log(`[Call ${callIndex}] Grounding used ${groundingSourceCount} sources`);

        const searchQueries = vertexResult.groundingMetadata?.webSearchQueries;
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
    difficulty,
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

  // Load fingerprints if deduplication is enabled
  let existingFingerprints = new Set<string>();
  if (enableDeduplication && env.DB) {
    existingFingerprints = await loadExistingFingerprints(
      env.DB as any,
      subject
    );
    console.log(`Loaded ${existingFingerprints.size} existing fingerprints for ${subject}`);
  }

  console.log(`Starting single-call generation for ${count} questions`);
  const overallStart = Date.now();

  // Get retry config from env or use defaults
  const maxRetries = parseInt(env.LLM_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10);
  const baseDelayMs = parseInt(env.LLM_RETRY_DELAY_MS || String(DEFAULT_RETRY_DELAY_MS), 10);

  const singleResult = await retryWithBackoff(
    async () => {
      const result = await generateQuizCall(
        env,
        {
          ...params,
          count,
          enableCurrentAffairs: groundingEnabled,
          currentAffairsTheme,
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

  allQuestions = allQuestions.concat(singleResult.questions);
  totalPromptChars += singleResult.metrics.promptChars || 0;
  totalResponseChars += singleResult.metrics.responseChars || 0;
  totalPromptTokens += singleResult.metrics.usagePromptTokens || 0;
  totalCompletionTokens += singleResult.metrics.usageCompletionTokens || 0;
  totalTokens += singleResult.metrics.usageTotalTokens || 0;
  totalGroundingSources += singleResult.groundingSourceCount || 0;

  console.log(`Generated ${allQuestions.length}/${count} questions total`);

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

  // Deduplication
  let finalQuestions = fixedQuestions;
  let dedupFilteredCount = 0;
  let standardReclassifiedCount = 0;

  if (enableDeduplication) {
    const dedupedQuestions: GeneratedQuestion[] = [];

    for (const question of fixedQuestions) {
      const fingerprint = generateFingerprint(question);
      if (existingFingerprints.has(fingerprint)) {
        dedupFilteredCount++;
      } else {
        dedupedQuestions.push(question);
        existingFingerprints.add(fingerprint);
      }
    }
    finalQuestions = dedupedQuestions;
    if (dedupFilteredCount > 0) {
      console.warn(`Deduplicated ${dedupFilteredCount} questions`);
    }
  }

  if (finalQuestions.length > 0) {
    for (const question of finalQuestions) {
      if (question.questionType !== "standard") continue;
      const text = question.questionText.toLowerCase();
      if (
        text.includes("consider the following statements") ||
        text.includes("how many of the above") ||
        text.includes("which of the statements")
      ) {
        question.questionType = "statement";
        standardReclassifiedCount++;
      }
    }
    if (standardReclassifiedCount > 0) {
      console.warn(`Reclassified ${standardReclassifiedCount} standard questions as statement style`);
    }
  }

  const factualMinimum = Math.round(count * 0.40);
  const getFactualCount = () =>
    finalQuestions.filter(q => q.questionType === "standard").length;
  const hasFactualMinimum = () => getFactualCount() >= factualMinimum;
  const shouldRegenerate = () =>
    (enableDeduplication && finalQuestions.length < count) || !hasFactualMinimum();

  if (shouldRegenerate()) {
    let remaining = enableDeduplication
      ? Math.max(count - finalQuestions.length, factualMinimum - getFactualCount())
      : Math.max(factualMinimum - getFactualCount(), 0);
    let regenerationIndex = 1;
    const regenerationLimit = 3;

    while (remaining > 0 && regenerationIndex <= regenerationLimit) {
      const factualNeededNow = Math.max(factualMinimum - getFactualCount(), 0);
      const factualOnly = factualNeededNow > 0;
      const reason = enableDeduplication
        ? factualOnly
          ? "to meet factual minimum"
          : "after dedup"
        : "to meet factual minimum";
      console.log(`Regenerating ${remaining} question(s) ${reason} (attempt ${regenerationIndex})...`);
      const regenerated = await retryWithBackoff(
        async () => {
          const result = await generateQuizCall(
            env,
            {
              ...params,
              count: remaining,
              styles: factualOnly ? ["factual"] : params.styles,
              enableCurrentAffairs: groundingEnabled,
              currentAffairsTheme,
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
        if (enableDeduplication) {
          const fingerprint = generateFingerprint(question);
          if (existingFingerprints.has(fingerprint)) {
            dedupFilteredCount++;
            continue;
          }
          existingFingerprints.add(fingerprint);
        }

        const text = question.questionText.toLowerCase();
        if (
          question.questionType === "standard" &&
          (
            text.includes("consider the following statements") ||
            text.includes("how many of the above") ||
            text.includes("which of the statements")
          )
        ) {
          question.questionType = "statement";
          standardReclassifiedCount++;
        }

        if (factualOnly && question.questionType !== "standard") {
          continue;
        }

        finalQuestions.push(question);
      }

      if (enableDeduplication) {
        remaining = Math.max(count - finalQuestions.length, factualMinimum - getFactualCount());
      } else {
        remaining = Math.max(factualMinimum - getFactualCount(), 0);
      }

      regenerationIndex += 1;
    }
  }

  if (finalQuestions.length > count) {
    const factualQuestions = finalQuestions.filter(q => q.questionType === "standard");
    const nonFactualQuestions = finalQuestions.filter(q => q.questionType !== "standard");
    finalQuestions = [...factualQuestions, ...nonFactualQuestions].slice(0, count);
  } else {
    finalQuestions = finalQuestions.slice(0, count);
  }

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
        { env, parentCallId: overallCallId, subject, theme, difficulty }
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
          { env, parentCallId: overallCallId, subject, theme, difficulty }
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

  // Save fingerprints
  if (enableDeduplication && env.DB && finalQuestions.length > 0) {
    // Fire and forget fingerprint saving to save time
    saveFingerprints(env.DB as any, finalQuestions, subject, theme).catch(err =>
      console.error("Background fingerprint save failed:", err)
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
      difficulty,
      styles,
      requestedCount: count,
      returnedCount: finalQuestions.length,
      dedupEnabled: enableDeduplication || false,
      dedupFilteredCount,
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

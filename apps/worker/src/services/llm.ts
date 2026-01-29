import { createVertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import { VertexAI, type GenerateContentResult } from "@google-cloud/vertexai";
import type { Env } from "../types.js";
import type { GeneratedQuestion, QuestionStyle, Difficulty } from "@mcqs/shared";
import { getPrompt } from "../prompts/index.js";
import { validateBatch, autoFixQuestion, factCheckBatch } from "./validator.js";
import {
  generateFingerprint,
  FINGERPRINT_QUERIES,
} from "./deduplication.js";
import { dumpLlmCall, serializeError } from "./llm-dump.js";

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================
const DEFAULT_MAX_RETRIES = 5;
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

  // 429 Rate Limiting
  if (err.code === 429 || err.status === 'RESOURCE_EXHAUSTED') return true;

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
  return err.code === 429 || err.status === 'RESOURCE_EXHAUSTED';
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
// NATIVE VERTEX AI GENERATION WITH GROUNDING
// Uses @google-cloud/vertexai directly for Google Search grounding
// This works in Node.js (Docker) environment with service account auth
// ============================================================================
interface VertexGroundingResult {
  text: string;
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    groundingSupports?: any[];
    webSearchQueries?: string[];
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

async function generateWithVertexGrounding(
  serviceAccount: { project_id: string; client_email: string; private_key: string },
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  location: string = "global"
): Promise<VertexGroundingResult> {
  // Initialize native Vertex AI client
  const vertexAI = new VertexAI({
    project: serviceAccount.project_id,
    location,
    apiEndpoint: location === "global" ? "aiplatform.googleapis.com" : undefined,
    googleAuthOptions: {
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    },
  });

  // Get the preview generative model with Google Search grounding tool
  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens,
      temperature: 1.0, // Recommended for grounding
    },
  });

  const googleSearchTool = {
    googleSearch: {},
  };

  // Generate content with grounding
  const result: GenerateContentResult = await generativeModel.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    tools: [googleSearchTool],
  } as any);
  const response = result.response;

  // Extract text from response
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || "")
    .join("") || "";

  // Extract grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata as any;
  const groundingChunks = groundingMetadata?.groundingChunks;
  const webSearchQueries = groundingMetadata?.webSearchQueries;

  // Extract usage metadata
  const usageMetadata = response.usageMetadata;

  return {
    text,
    groundingMetadata: groundingChunks
      ? {
        groundingChunks: groundingChunks.map((chunk: any) => ({
          web: chunk?.web,
        })),
        webSearchQueries,
      }
      : undefined,
    usage: usageMetadata
      ? {
        promptTokens: usageMetadata.promptTokenCount,
        completionTokens: usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.totalTokenCount,
      }
      : undefined,
  };
}

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
- 56% of questions are statement-based (2-5 statements to evaluate)
- ~8 match-the-following questions per paper
- ~7-18 assertion-reason questions per paper

CRITICAL REQUIREMENTS:
1. FACTUAL ACCURACY: Every fact, date, article number, year MUST be 100% accurate. Cross-reference with NCERT, Laxmikanth, Spectrum, Ramesh Singh.
2. SINGLE CORRECT ANSWER: There must be exactly ONE definitively correct answer.
3. SMART DISTRACTORS: DO NOT use absolute words (only, always, never, all, none) in wrong options - UPSC aspirants know this pattern.
4. EDUCATIONAL EXPLANATIONS: Explain WHY correct answer is right AND why each distractor is wrong.
5. TIME CONTEXT: Today's date is ${currentDateHuman} (UTC date: ${currentDateISO}).

OUTPUT FORMAT:
Respond with ONLY a valid JSON array. No other text, no markdown, no explanations outside JSON.

Each question object must have:
{
  "questionText": "Complete question with proper formatting for statements/assertions",
  "questionType": "standard" | "statement" | "match" | "assertion",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctOption": 0-3 (index: 0=A, 1=B, 2=C, 3=D),
  "explanation": "Detailed explanation with source references"
}

QUESTION TYPE FORMATS:
- STATEMENT: "Consider the following statements: 1. ... 2. ... 3. ... How many of the above statements is/are correct?" Options: A) Only one B) Only two C) All three D) None
- ASSERTION-REASON: "Assertion (A): ... Reason (R): ... Which is correct?" Options must be the standard 4 A-R options.
- MATCH: "Match List-I with List-II..." with proper table format and combination options like "A-1, B-2, C-3, D-4"

Generate exactly ${count} questions now.`;

  const fullPrompt = `${systemPrompt}\n\n=== USER PROMPT ===\n\n${prompt}`;
  const totalPromptChars = systemPrompt.length + promptChars;

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

  const vertex = createVertex({
    project: serviceAccount.project_id,
    location: env.GOOGLE_VERTEX_LOCATION || "global",
    googleAuthOptions: {
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    },
  });

  const generationStart = Date.now();
  let text = "";
  let usage: any;
  let generationDurationMs = 0;
  let responseChars = 0;
  let groundingSourceCount = 0;
  let groundingSources: Array<{ uri?: string; title?: string }> = [];

  try {
    console.log(`[Call ${callIndex}] Starting generation for ${count} questions${enableCurrentAffairs ? " (with NATIVE grounding)" : ""}...`);

    // BRANCH: Use Gemini API for grounding (fixes Gemini 3 Pro Preview issues with Vertex AI SDK)
    // Use Vertex AI SDK for all calls (service account auth)
    if (enableCurrentAffairs) {
      // ========== VERTEX AI GROUNDING PATH ==========
      // Using native @google-cloud/vertexai for Google Search grounding
      console.log(`[Call ${callIndex}] Using Vertex AI with Google Search grounding...`);

      const vertexResult = await generateWithVertexGrounding(
        serviceAccount,
        generationModel,
        systemPrompt,
        prompt,
        maxTokens,
        env.GOOGLE_VERTEX_LOCATION || "global"
      );

      generationDurationMs = Date.now() - generationStart;
      text = vertexResult.text;
      responseChars = text.length;

      // Extract usage from Vertex response
      usage = {
        promptTokens: vertexResult.usage?.promptTokens,
        completionTokens: vertexResult.usage?.completionTokens,
        totalTokens: vertexResult.usage?.totalTokens,
      };

      // Extract grounding metadata from Vertex response
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

        // Log search queries for debugging
        const searchQueries = vertexResult.groundingMetadata?.webSearchQueries;
        if (searchQueries?.length) {
          console.log(`[Call ${callIndex}] Search queries: ${searchQueries.join(", ")}`);
        }
      } else {
        groundingSourceCount = 0;
        console.warn(`[Call ${callIndex}] No grounding chunks returned - model may not have searched`);
      }


    } else {
      // ========== VERCEL AI SDK PATH (for non-grounding calls) ==========
      // Configure generation with thinking support for better reasoning
      const generationConfig: Parameters<typeof generateText>[0] = {
        model: vertex(generationModel),
        system: systemPrompt,
        prompt,
        maxOutputTokens: maxTokens,
        // Enable thinking mode for Gemini 3 models - improves reasoning for complex UPSC questions
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingLevel: "high", // HIGH for best reasoning on complex problems
            },
          },
        },
      };

      const generation = await generateText(generationConfig);
      generationDurationMs = Date.now() - generationStart;
      text = generation.text;
      usage = (generation as any).usage;
      responseChars = text.length;
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
      return JSON.parse(text);
    } catch { }

    // 2. Extract from markdown
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch { }
    }

    // 3. Try to clean markdown code blocks
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
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
  const groundingEnabled = !!enableCurrentAffairs && env.ENABLE_WEB_GROUNDING === "1";

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

  // Normalize questions
  const normalizedQuestions = allQuestions.slice(0, count).map((q, i) => ({
    questionText: q.questionText || `Question ${i + 1}`,
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

  // Auto-fix
  const fixedQuestions = normalizedQuestions.map(autoFixQuestion);

  // Deduplication
  let finalQuestions = fixedQuestions;
  let dedupFilteredCount = 0;

  if (enableDeduplication && existingFingerprints.size > 0) {
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

  // Validation
  const validationResult = validateBatch(finalQuestions);

  // Fact Check
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

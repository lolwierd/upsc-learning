import { createVertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import type { Env } from "../types";
import type { GeneratedQuestion, QuestionStyle, Difficulty } from "@mcqs/shared";
import { getPrompt, type QuestionEra } from "../prompts";
import { validateBatch, autoFixQuestion, factCheckBatch } from "./validator";
import {
  generateFingerprint,
  FINGERPRINT_QUERIES,
} from "./deduplication";
import { dumpLlmCall, serializeError } from "./llm-dump";

interface GenerateQuizParams {
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  count: number;
  apiKey?: string;
  era?: QuestionEra; // UPSC PYQ style era
  enableFactCheck?: boolean; // Use Gemini Pro to verify facts
  enableDeduplication?: boolean; // Check against previously generated questions
}

export interface GenerateQuizMetrics {
  provider: "gemini";
  model: string;
  factCheckModel: string;
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  era: QuestionEra;
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

export async function generateQuiz(
  env: Env,
  params: GenerateQuizParams
): Promise<{ questions: GeneratedQuestion[]; metrics: GenerateQuizMetrics }> {
  const {
    subject,
    theme,
    difficulty,
    styles,
    count,
    apiKey,
    era = "current",
    enableFactCheck: enableFactCheckParam,
    enableDeduplication = true,
  } = params;

  const generationModel = "gemini-3-flash-preview";
  const factCheckModel = env.FACT_CHECK_MODEL ?? "gemini-3-flash-preview";
  const enableFactCheck = enableFactCheckParam ?? env.ENABLE_FACT_CHECK === "1";

  // Input validation
  if (!subject?.trim()) {
    throw new Error("Subject is required.");
  }
  if (!Array.isArray(styles) || styles.length === 0) {
    throw new Error("At least one question style is required.");
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Count must be a positive integer.");
  }

  // Get API key from params or environment
  // const geminiApiKey = apiKey || env.GOOGLE_API_KEY;

  // if (!geminiApiKey) {
  //   throw new Error("Gemini API key is required. Please add it in Settings.");
  // }

  // Warn if deduplication enabled but DB not available
  if (enableDeduplication && !env.DB) {
    console.warn("Deduplication enabled but DB not configured - skipping deduplication.");
  }

  // Load existing fingerprints for deduplication
  let existingFingerprints = new Set<string>();
  if (enableDeduplication && env.DB) {
    existingFingerprints = await loadExistingFingerprints(env.DB, subject);
    console.log(`Loaded ${existingFingerprints.size} existing fingerprints for ${subject}`);
  }

  // Distribute questions across styles
  const questionsPerStyle = Math.floor(count / styles.length);
  const remainderQuestions = count % styles.length;

  // Create distribution: each style gets base count, first styles get the remainder
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
    era,
  });

  const promptChars = prompt.length;

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

  const totalPromptChars = systemPrompt.length + promptChars;
  const generationCallId = crypto.randomUUID();
  const maxTokens = Math.min(8000 + count * 300, 32000);

  // Parse service account from env or fallback to error
  let serviceAccount: any;
  try {
    if (env.GCP_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(env.GCP_SERVICE_ACCOUNT);
    } else {
      // Fallback for local dev if the file exists (optional, but better to enforce env var in production)
      // But since we are moving away from file import in code, we should error if missing in Prod
      // For local dev, we can still assume .dev.vars injects it or we strictly require it.
      throw new Error("GCP_SERVICE_ACCOUNT environment variable is not set");
    }
  } catch (e: any) {
    throw new Error(`Failed to load Google Service Account: ${e.message}`);
  }

  // Use Vertex AI
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
  let usage:
    | {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }
    | undefined;
  let generationDurationMs = 0;
  let responseChars = 0;

  try {
    const generation = await generateText({
      model: vertex(generationModel),
      system: systemPrompt,
      prompt,
      maxOutputTokens: maxTokens, // Increased tokens for detailed questions and explanations
    });
    generationDurationMs = Date.now() - generationStart;
    text = generation.text;
    usage = (generation as {
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }).usage;
    responseChars = text.length;
  } catch (error) {
    generationDurationMs = Date.now() - generationStart;

    await dumpLlmCall(env, {
      kind: "generation",
      callId: generationCallId,
      model: generationModel,
      provider: "gemini",
      startedAtMs: generationStart,
      durationMs: generationDurationMs,
      request: {
        system: systemPrompt,
        prompt,
        maxTokens,
        metadata: {
          subject,
          theme: theme ?? null,
          difficulty,
          styles,
          era,
          requestedCount: count,
          enableDeduplication,
          enableFactCheck,
        },
      },
      response: {
        text: "",
        error: serializeError(error),
      },
    });

    throw error;
  }

  if (env.LLM_DEBUG === "1") {
    console.log(
      `[generateQuiz] model=${generationModel} durationMs=${generationDurationMs} promptChars=${totalPromptChars} responseChars=${responseChars}`
    );
  }

  await dumpLlmCall(env, {
    kind: "generation",
    callId: generationCallId,
    model: generationModel,
    provider: "gemini",
    startedAtMs: generationStart,
    durationMs: generationDurationMs,
    request: {
      system: systemPrompt,
      prompt,
      maxTokens,
      metadata: {
        subject,
        theme: theme ?? null,
        difficulty,
        styles,
        era,
        requestedCount: count,
        enableDeduplication,
        enableFactCheck,
      },
    },
    response: {
      text,
      usage: {
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
      },
    },
  });

  // Parse the response
  try {
    // Clean up response - handle markdown code blocks
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");

    // Try direct parse first, then fall back to regex extraction
    let rawQuestions: GeneratedQuestion[];
    let parseStrategy: "direct" | "extracted" = "direct";
    try {
      rawQuestions = JSON.parse(cleaned);
    } catch {
      // Fall back to extracting JSON array from response
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      parseStrategy = "extracted";
      rawQuestions = JSON.parse(jsonMatch[0]);
    }

    // Normalize questions first
    const normalizedQuestions = rawQuestions.slice(0, count).map((q, i) => ({
      questionText: q.questionText || `Question ${i + 1}`,
      questionType: q.questionType || "standard",
      options: Array.isArray(q.options) && q.options.length === 4
        ? q.options
        : ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      correctOption: typeof q.correctOption === "number" && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption
        : 0,
      explanation: q.explanation || "No explanation provided.",
      metadata: q.metadata,
    }));

    // Auto-fix common issues
    const fixedQuestions = normalizedQuestions.map(autoFixQuestion);

    // Deduplication: Filter out questions similar to previously generated ones
    let finalQuestions = fixedQuestions;
    let dedupFilteredCount = 0;
    if (enableDeduplication && existingFingerprints.size > 0) {
      const dedupedQuestions: GeneratedQuestion[] = [];
      const duplicatesFound: string[] = [];

      for (const question of fixedQuestions) {
        const fingerprint = generateFingerprint(question);
        if (existingFingerprints.has(fingerprint)) {
          duplicatesFound.push(question.questionText.slice(0, 80) + "...");
        } else {
          dedupedQuestions.push(question);
          existingFingerprints.add(fingerprint); // Prevent duplicates within same batch
        }
      }

      if (duplicatesFound.length > 0) {
        dedupFilteredCount = duplicatesFound.length;
        console.warn(`Filtered ${duplicatesFound.length} duplicate questions`);
      }

      finalQuestions = dedupedQuestions;
    }

    // Validate the batch
    const validationResult = validateBatch(finalQuestions);
    const validationErrorCount = validationResult.results.reduce(
      (sum, r) => sum + r.errors.length,
      0
    );
    const validationWarningCount = validationResult.results.reduce(
      (sum, r) => sum + r.warnings.length,
      0
    );

    // Log validation results for debugging (but don't fail the request)
    if (!validationResult.isValid || validationResult.batchWarnings.length > 0) {
      console.warn("Question validation issues detected:");
      validationResult.results.forEach((r) => {
        if (r.errors.length > 0) {
          console.warn(`  Q${r.questionIndex + 1} Errors:`, r.errors);
        }
        if (r.warnings.length > 0) {
          console.warn(`  Q${r.questionIndex + 1} Warnings:`, r.warnings);
        }
      });
      if (validationResult.batchWarnings.length > 0) {
        console.warn("  Batch warnings:", validationResult.batchWarnings);
      }
    }

    // Fact-check ALL questions with Gemini Pro (quality over cost)
    let factCheckDurationMs: number | null = null;
    let factCheckCheckedCount: number | null = null;
    let factCheckIssueCount: number | null = null;
    if (enableFactCheck && finalQuestions.length > 0) {
      console.log(`Running fact-check with Gemini Pro on ALL ${finalQuestions.length} questions...`);
      const factCheckStart = Date.now();
      const factCheckResult = await factCheckBatch(
        finalQuestions,
        "", // apiKey ignored as we use service account
        {
          env,
          parentCallId: generationCallId,
          subject,
          theme,
          difficulty,
          era,
        }
      );
      factCheckDurationMs = Date.now() - factCheckStart;
      factCheckCheckedCount = factCheckResult.checkedCount;
      factCheckIssueCount = factCheckResult.issues.length;

      if (factCheckResult.issues.length > 0) {
        console.warn("Fact-check found potential issues:");
        for (const issue of factCheckResult.issues) {
          console.warn(
            `  Q${issue.questionIndex + 1}: ${issue.result.issues.join(", ")}`
          );
        }
      } else {
        console.log(
          `Fact-check passed: ${factCheckResult.accurateCount}/${factCheckResult.checkedCount} verified`
        );
      }
    }

    // Save fingerprints for future deduplication
    if (enableDeduplication && env.DB && finalQuestions.length > 0) {
      await saveFingerprints(env.DB, finalQuestions, subject, theme);
      console.log(`Saved ${finalQuestions.length} fingerprints for future deduplication`);
    }

    // Warn if returning fewer than requested
    if (finalQuestions.length < count) {
      console.warn(`Requested ${count} questions but returning ${finalQuestions.length} after deduplication/validation.`);
    }

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
        era,
        requestedCount: count,
        returnedCount: finalQuestions.length,
        dedupEnabled: enableDeduplication,
        dedupFilteredCount,
        validationIsValid: validationResult.isValid,
        validationInvalidCount: validationResult.invalidQuestions,
        validationErrorCount,
        validationWarningCount,
        validationBatchWarnings: validationResult.batchWarnings,
        parseStrategy,
        promptChars: totalPromptChars,
        responseChars,
        generationDurationMs,
        factCheckEnabled: enableFactCheck,
        factCheckDurationMs,
        factCheckCheckedCount,
        factCheckIssueCount,
        usagePromptTokens: usage?.promptTokens ?? null,
        usageCompletionTokens: usage?.completionTokens ?? null,
        usageTotalTokens: usage?.totalTokens ?? null,
      },
    };
  } catch (error) {
    console.error("Failed to parse LLM response:", error);
    // Truncate raw response to avoid huge log entries and potential data leaks
    console.error("Raw response (first 2000 chars):", text.slice(0, 2000));
    throw new Error("Failed to generate valid questions. Please try again.");
  }
}

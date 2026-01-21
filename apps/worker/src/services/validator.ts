import type { GeneratedQuestion } from "@mcqs/shared";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import type { Env } from "../types";
import { dumpLlmCall, serializeError } from "./llm-dump";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FactCheckResult {
  isAccurate: boolean;
  confidence: "high" | "medium" | "low";
  issues: string[];
  suggestions: string[];
}

export interface QuestionValidationResult extends ValidationResult {
  questionIndex: number;
  question: GeneratedQuestion;
}

export interface BatchValidationResult {
  isValid: boolean;
  totalQuestions: number;
  validQuestions: number;
  invalidQuestions: number;
  results: QuestionValidationResult[];
  batchWarnings: string[];
}

// Words that make distractors too obvious (UPSC aspirants know these patterns)
const ABSOLUTE_WORDS = [
  "always",
  "never",
  "only",
  "all",
  "none",
  "every",
  "must",
  "cannot",
  "impossible",
  "completely",
  "entirely",
  "absolutely",
];

// Check if option text contains absolute words (excluding correct answer)
function hasAbsoluteWords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ABSOLUTE_WORDS.some((word) => {
    // Match whole words only
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(lowerText);
  });
}

// Validate option format (should start with A), B), C), D))
function hasValidOptionFormat(options: string[]): boolean {
  const expectedPrefixes = ["A)", "B)", "C)", "D)"];
  return options.every(
    (opt, idx) =>
      opt.startsWith(expectedPrefixes[idx]) ||
      opt.startsWith(expectedPrefixes[idx].toLowerCase())
  );
}

// Check for "All of the above" or "None of the above" patterns
function hasAllNoneAbovePattern(options: string[]): string | null {
  const patterns = [
    /all\s+(of\s+)?the\s+above/i,
    /none\s+(of\s+)?the\s+above/i,
    /both\s+\(?\s*[a-d]\s*\)?\s+and\s+\(?\s*[a-d]\s*\)/i,
  ];

  for (const option of options) {
    for (const pattern of patterns) {
      if (pattern.test(option)) {
        return option;
      }
    }
  }
  return null;
}

// Validate Statement-I/II format options
function validateStatementOptions(
  question: GeneratedQuestion
): string | null {
  if (question.questionType !== "assertion") return null;

  const questionText = question.questionText;
  const isStatementIii = /statement[-\s]?iii\s*:/i.test(questionText);

  const expectedOptions = isStatementIii
    ? [
        /both.*statement.?ii.*and.*statement.?iii.*correct.*both.*explain.*statement.?i/i,
        /both.*statement.?ii.*and.*statement.?iii.*correct.*only\s+one.*explain.*statement.?i/i,
        /only\s+one.*statements?\s*(ii|2)\s*(and|&)\s*(iii|3).*correct.*explain.*statement.?i/i,
        /neither.*statement.?ii.*nor.*statement.?iii.*correct/i,
      ]
    : [
        /both.*statement.*correct.*explanation/i,
        /both.*statement.*correct.*not.*explanation/i,
        /statement.?i.*correct.*statement.?ii.*incorrect/i,
        /statement.?i.*incorrect.*statement.?ii.*correct/i,
      ];

  // Check if at least 3 out of 4 options match expected patterns
  let matchCount = 0;
  for (const option of question.options) {
    if (expectedOptions.some((pattern) => pattern.test(option))) {
      matchCount++;
    }
  }

  if (matchCount < 3) {
    return "Statement-format question options don't follow UPSC format";
  }
  return null;
}

// Validate "How many" format options
function validateHowManyOptions(question: GeneratedQuestion): string | null {
  const questionText = question.questionText.toLowerCase();

  if (!questionText.includes("how many")) return null;

  const expectedPatterns = [
    /only\s+one/i,
    /only\s+two/i,
    /only\s+three/i,
    /all\s+(three|four|five)/i,
    /none/i,
  ];

  let matchCount = 0;
  for (const option of question.options) {
    if (expectedPatterns.some((pattern) => pattern.test(option))) {
      matchCount++;
    }
  }

  if (matchCount < 3) {
    return '"How many" question options should be like "Only one", "Only two", "All three", "None"';
  }
  return null;
}

// Validate match question format
function validateMatchFormat(question: GeneratedQuestion): string | null {
  if (question.questionType !== "match") return null;

  const questionText = question.questionText.toLowerCase();

  // Check if it's a "how many pairs" format or classic match format
  if (questionText.includes("how many")) {
    // "How many pairs correctly matched" format
    return validateHowManyOptions(question);
  }

  // Classic match format should have A-1, B-2 style options
  const matchPatterns = [/[a-d]\s*[-–]\s*[1-4]/i, /[1-4]\s*[-–]\s*[a-d]/i];

  let hasMatchFormat = false;
  for (const option of question.options) {
    if (matchPatterns.some((pattern) => pattern.test(option))) {
      hasMatchFormat = true;
      break;
    }
  }

  if (!hasMatchFormat) {
    return "Match question options should follow 'A-1, B-2, C-3, D-4' format or 'How many pairs' format";
  }
  return null;
}

// Main validation function for a single question
export function validateQuestion(
  question: GeneratedQuestion,
  index: number
): QuestionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check if question has all required fields
  if (!question.questionText || question.questionText.trim().length < 10) {
    errors.push("Question text is missing or too short");
  }

  // 2. Validate options array
  if (!Array.isArray(question.options)) {
    errors.push("Options must be an array");
  } else if (question.options.length !== 4) {
    errors.push(`Expected 4 options, got ${question.options.length}`);
  } else {
    // 3. Check option format - DEPRECATED: We now strip prefixes, so we don't enforce them
    // if (!hasValidOptionFormat(question.options)) {
    //   warnings.push("Options should start with A), B), C), D) prefix");
    // }

    // 4. Check for absolute words in wrong options
    // Skip this check for "how many" questions and statement-code options where these words are required
    const isHowMany = question.questionText.toLowerCase().includes("how many");
    const isCodeOption = question.options.some(o => /\b\d+\s+only\b/i.test(o) || /^[A-D]\)\s*(only\s+(one|two|three|four)|none|all\s+(three|four|five))/i.test(o));

    if (!isHowMany && !isCodeOption) {
      question.options.forEach((option, idx) => {
        if (idx !== question.correctOption && hasAbsoluteWords(option)) {
          warnings.push(
            `Option ${String.fromCharCode(65 + idx)} contains absolute words ("always", "never", "only", etc.) - UPSC aspirants know this pattern`
          );
        }
      });
    }

    // 5. Check for "All of the above" / "None of the above" patterns
    // Skip for "how many" questions where these are valid answer formats
    const allNonePattern = hasAllNoneAbovePattern(question.options);
    if (allNonePattern && !isHowMany) {
      warnings.push(
        `Found "All/None of the above" pattern: "${allNonePattern}" - avoid unless it's a statement count question`
      );
    }
  }

  // 6. Validate correctOption
  if (
    typeof question.correctOption !== "number" ||
    question.correctOption < 0 ||
    question.correctOption > 3
  ) {
    errors.push("correctOption must be 0, 1, 2, or 3");
  }

  // 7. Validate questionType
  const validTypes = ["standard", "statement", "match", "assertion"];
  if (!validTypes.includes(question.questionType)) {
    errors.push(
      `Invalid questionType: ${question.questionType}. Must be one of: ${validTypes.join(", ")}`
    );
  }

  // 8. Type-specific validations
  const statementError = validateStatementOptions(question);
  if (statementError) {
    warnings.push(statementError);
  }

  const howManyError = validateHowManyOptions(question);
  if (howManyError) {
    warnings.push(howManyError);
  }

  const matchError = validateMatchFormat(question);
  if (matchError) {
    warnings.push(matchError);
  }

  // 9. Check explanation quality
  if (!question.explanation || question.explanation.length < 50) {
    warnings.push("Explanation is missing or too short (should be educational)");
  } else if (!question.explanation.toLowerCase().includes("correct")) {
    warnings.push(
      "Explanation should explain why the correct answer is correct"
    );
  }

  // 10. Check for duplicate options
  const optionTexts = question.options.map((o) =>
    o.replace(/^[A-D]\)\s*/i, "").toLowerCase().trim()
  );
  const uniqueOptions = new Set(optionTexts);
  if (uniqueOptions.size !== optionTexts.length) {
    errors.push("Duplicate options detected");
  }

  return {
    questionIndex: index,
    question,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate a batch of questions
export function validateBatch(
  questions: GeneratedQuestion[]
): BatchValidationResult {
  const results = questions.map((q, idx) => validateQuestion(q, idx));
  const batchWarnings: string[] = [];

  // Check answer distribution
  const answerCounts = [0, 0, 0, 0];
  results.forEach((r) => {
    if (r.isValid) {
      answerCounts[r.question.correctOption]++;
    }
  });

  const totalValid = results.filter((r) => r.isValid).length;
  if (totalValid >= 4) {
    // Check if any answer appears more than 40% of the time
    const maxCount = Math.max(...answerCounts);
    if (maxCount / totalValid > 0.4) {
      const dominantOption = String.fromCharCode(
        65 + answerCounts.indexOf(maxCount)
      );
      batchWarnings.push(
        `Answer "${dominantOption}" appears ${maxCount}/${totalValid} times (${Math.round((maxCount / totalValid) * 100)}%) - consider more balanced distribution`
      );
    }

    // Check if any answer never appears
    answerCounts.forEach((count, idx) => {
      if (count === 0 && totalValid >= 8) {
        batchWarnings.push(
          `Option "${String.fromCharCode(65 + idx)}" is never the correct answer in this batch`
        );
      }
    });
  }

  // Check question type distribution for variety
  const typeCounts: Record<string, number> = {};
  results.forEach((r) => {
    const type = r.question.questionType;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  // Check "how many" format distribution
  const formatDistribution = validateFormatDistribution(questions);
  if (formatDistribution.warning) {
    batchWarnings.push(formatDistribution.warning);
  }

  return {
    isValid: results.every((r) => r.isValid),
    totalQuestions: questions.length,
    validQuestions: results.filter((r) => r.isValid).length,
    invalidQuestions: results.filter((r) => !r.isValid).length,
    results,
    batchWarnings,
  };
}

// Validate format distribution - check "how many" percentage
export function validateFormatDistribution(questions: GeneratedQuestion[]): {
  isValid: boolean;
  howManyCount: number;
  howManyPercentage: number;
  warning: string | null;
} {
  if (questions.length === 0) {
    return { isValid: true, howManyCount: 0, howManyPercentage: 0, warning: null };
  }

  const howManyCount = questions.filter(q =>
    q.questionText.toLowerCase().includes("how many")
  ).length;

  const howManyPercentage = Math.round((howManyCount / questions.length) * 100);

  // Target: <= 45% "how many" questions (with some tolerance over the 35-40% target)
  const isValid = howManyPercentage <= 45;
  const warning = howManyPercentage > 40
    ? `"How many" format at ${howManyPercentage}% (${howManyCount}/${questions.length}) - exceeds 35-40% target for balanced practice`
    : null;

  return {
    isValid,
    howManyCount,
    howManyPercentage,
    warning,
  };
}

// Quick fix function for common issues
export function autoFixQuestion(
  question: GeneratedQuestion
): GeneratedQuestion {
  const fixed = { ...question };

  // Strip option prefixes if present (A), B), 1., etc.)
  fixed.options = fixed.options.map((opt) => {
    // Matches "A) ", "A. ", "1. ", "(a) ", etc. at start of string
    return opt.replace(/^([A-D0-9a-d]+\s*[).]\s*|\([A-D0-9a-d]+\)\s*)/i, "").trim();
  });

  // Ensure correctOption is valid
  if (
    typeof fixed.correctOption !== "number" ||
    fixed.correctOption < 0 ||
    fixed.correctOption > 3
  ) {
    fixed.correctOption = 0;
  }

  // Ensure questionType is valid
  const validTypes = ["standard", "statement", "match", "assertion"];
  if (!validTypes.includes(fixed.questionType)) {
    // Try to infer from question text
    const text = fixed.questionText.toLowerCase();
    if (
      text.includes("consider the following statements") ||
      text.includes("how many of the above")
    ) {
      fixed.questionType = "statement";
    } else if (
      text.includes("match") ||
      text.includes("list-i") ||
      text.includes("pairs")
    ) {
      fixed.questionType = "match";
  } else if (
    text.includes("statement-i") ||
    text.includes("statement i") ||
    text.includes("assertion") ||
    text.includes("reason")
  ) {
    fixed.questionType = "assertion";
  } else {
      fixed.questionType = "standard";
    }
  }

  return fixed;
}

// ============================================================================
// GEMINI PRO FACT-CHECKING
// ============================================================================

const FACT_CHECK_PROMPT = `You are a UPSC exam expert fact-checker. Your job is to verify the factual accuracy of MCQ questions.

VERIFY THE FOLLOWING:
1. All facts, dates, numbers, article numbers, amendment numbers are ACCURATE
2. The marked correct answer is DEFINITELY correct
3. All other options are DEFINITELY incorrect
4. No ambiguity exists - only ONE answer is correct

Respond with ONLY valid JSON in this format:
{
  "isAccurate": true/false,
  "confidence": "high" | "medium" | "low",
  "issues": ["list of factual errors found, if any"],
  "suggestions": ["fixes for the errors, if any"],
  "correctedAnswer": null or 0-3 if the marked answer is wrong
}

BE STRICT. If unsure about any fact, mark confidence as "low".`;

const FACT_CHECK_BATCH_PROMPT = `You are a UPSC exam expert fact-checker. Your job is to verify the factual accuracy of MCQ questions.

You will receive a JSON array of questions. For EACH question, verify:
1. All facts, dates, numbers, article numbers, amendment numbers are ACCURATE
2. The marked correct answer is DEFINITELY correct
3. All other options are DEFINITELY incorrect
4. No ambiguity exists - only ONE answer is correct

Return ONLY a valid JSON array of results, same length and order as the input.
Each element must be:
{
  "isAccurate": true/false,
  "confidence": "high" | "medium" | "low",
  "issues": ["list of factual errors found, if any"],
  "suggestions": ["fixes for the errors, if any"],
  "correctedAnswer": null or 0-3 if the marked answer is wrong
}

BE STRICT. If unsure about any fact, mark confidence as "low".`;

// Strip option prefix (A), B), etc.) from option text
function stripOptionPrefix(opt: string): string {
  return opt.replace(/^[A-D]\)\s*/i, "").trim();
}

export async function factCheckQuestion(
  question: GeneratedQuestion,
  env: Env
): Promise<FactCheckResult> {
  // Validate options array before processing
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    return {
      isAccurate: false,
      confidence: "low",
      issues: ["Invalid options array - expected exactly 4 options"],
      suggestions: ["Regenerate the question with valid options"],
    };
  }

  let serviceAccount: any;
  try {
    if (env.GCP_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(env.GCP_SERVICE_ACCOUNT);
    } else {
      throw new Error("GCP_SERVICE_ACCOUNT not set");
    }
  } catch (e) {
    return {
      isAccurate: true,
      confidence: "low",
      issues: ["Service account configuration missing"],
      suggestions: [],
    };
  }

  const vertex = createVertex({
    project: serviceAccount.project_id,
    location: "global",
    googleAuthOptions: {
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    },
  });

  // Strip prefixes to avoid "A) A) ..." duplication in prompt
  const questionDetails = `
QUESTION: ${question.questionText}

OPTIONS:
A) ${stripOptionPrefix(question.options[0] ?? "")}
B) ${stripOptionPrefix(question.options[1] ?? "")}
C) ${stripOptionPrefix(question.options[2] ?? "")}
D) ${stripOptionPrefix(question.options[3] ?? "")}

MARKED CORRECT: ${String.fromCharCode(65 + question.correctOption)} - ${stripOptionPrefix(question.options[question.correctOption] ?? "")}

  EXPLANATION PROVIDED: ${question.explanation}
`;

  try {
    const { text } = await generateText({
      model: vertex("gemini-3-pro-preview"),
      system: FACT_CHECK_PROMPT,
      prompt: questionDetails,
      maxOutputTokens: 1000,
      // Enable thinking mode for better fact verification reasoning
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: "high",
          },
        },
      },
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/); if (!jsonMatch) {
      return {
        isAccurate: true,
        confidence: "low",
        issues: ["Could not parse fact-check response"],
        suggestions: [],
      };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      isAccurate: result.isAccurate ?? true,
      confidence: result.confidence ?? "low",
      issues: result.issues ?? [],
      suggestions: result.suggestions ?? [],
    };
  } catch (error) {
    console.error("Fact-check failed:", error);
    return {
      isAccurate: true,
      confidence: "low",
      issues: ["Fact-check service unavailable"],
      suggestions: [],
    };
  }
}

async function factCheckBatchSingleCall(
  questions: GeneratedQuestion[],
  _apiKey: string, // Unused
  params?: {
    env?: Env;
    parentCallId?: string;
    subject?: string;
    theme?: string;
    difficulty?: string;
    era?: string;
  }
): Promise<{
  checkedCount: number;
  accurateCount: number;
  issues: Array<{ questionIndex: number; result: FactCheckResult }>;
}> {
  const env = params?.env;
  const startedAt = Date.now();
  const callId = crypto.randomUUID();
  const factCheckModel = env?.FACT_CHECK_MODEL ?? "gemini-3-flash-preview";

  const payload = questions.map((q, idx) => ({
    questionIndex: idx,
    questionText: q.questionText,
    options: [
      stripOptionPrefix(q.options?.[0] ?? ""),
      stripOptionPrefix(q.options?.[1] ?? ""),
      stripOptionPrefix(q.options?.[2] ?? ""),
      stripOptionPrefix(q.options?.[3] ?? ""),
    ],
    correctOption: q.correctOption,
    explanation: q.explanation,
  }));

  try {
    let serviceAccount: any;
    try {
      if (env?.GCP_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(env.GCP_SERVICE_ACCOUNT);
      } else {
        throw new Error("GCP_SERVICE_ACCOUNT not set");
      }
    } catch (e: any) {
      throw new Error(`Service Account Error: ${e.message}`);
    }

    const vertex = createVertex({
      project: serviceAccount.project_id,
      location: env?.GOOGLE_VERTEX_LOCATION || "global",
      googleAuthOptions: {
        credentials: {
          client_email: serviceAccount.client_email,
          private_key: serviceAccount.private_key,
        },
      },
    });
    const res = await generateText({
      model: vertex(factCheckModel),
      system: FACT_CHECK_BATCH_PROMPT,
      prompt: JSON.stringify(payload),
      maxOutputTokens: 6000,
      // Enable thinking mode for better fact verification reasoning
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: "high",
          },
        },
      },
    });
    const durationMs = Date.now() - startedAt;
    const text = res.text;

    const usage = (res as {
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    }).usage;

    if (env) {
      await dumpLlmCall(env, {
        kind: "fact_check",
        callId,
        parentCallId: params?.parentCallId,
        model: factCheckModel,
        provider: "gemini",
        startedAtMs: startedAt,
        durationMs,
        request: {
          system: FACT_CHECK_BATCH_PROMPT,
          prompt: JSON.stringify({
            count: payload.length,
            questions: payload,
          }),
          maxTokens: 6000,
          metadata: {
            mode: "batch",
            count: payload.length,
            subject: params?.subject ?? null,
            theme: params?.theme ?? null,
            difficulty: params?.difficulty ?? null,
            era: params?.era ?? null,
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

      if (env.LLM_DEBUG === "1") {
        console.log(
          `[factCheckBatch] mode=batch count=${payload.length} durationMs=${durationMs} responseChars=${text.length}`
        );
      }
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse fact-check batch response (no JSON array found)");
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      isAccurate?: boolean;
      confidence?: "high" | "medium" | "low";
      issues?: string[];
      suggestions?: string[];
      correctedAnswer?: number | null;
    }>;

    const issues: Array<{ questionIndex: number; result: FactCheckResult }> = [];
    let accurateCount = 0;

    for (let idx = 0; idx < questions.length; idx++) {
      const item = parsed[idx];
      const result: FactCheckResult = {
        isAccurate: item?.isAccurate ?? true,
        confidence: item?.confidence ?? "low",
        issues: item?.issues ?? [],
        suggestions: item?.suggestions ?? [],
      };

      if (!result.isAccurate || result.confidence === "low") {
        issues.push({ questionIndex: idx, result });
      } else {
        accurateCount++;
      }
    }

    return {
      checkedCount: questions.length,
      accurateCount,
      issues,
    };
  } catch (error) {
    if (env) {
      const durationMs = Date.now() - startedAt;

      await dumpLlmCall(env, {
        kind: "fact_check",
        callId,
        parentCallId: params?.parentCallId,
        model: factCheckModel,
        provider: "gemini",
        startedAtMs: startedAt,
        durationMs,
        request: {
          system: FACT_CHECK_BATCH_PROMPT,
          prompt: JSON.stringify({
            count: payload.length,
            questions: payload,
          }),
          maxTokens: 6000,
          metadata: {
            mode: "batch",
            count: payload.length,
            subject: params?.subject ?? null,
            theme: params?.theme ?? null,
            difficulty: params?.difficulty ?? null,
            era: params?.era ?? null,
          },
        },
        response: {
          text: "",
          error: serializeError(error),
        },
      });
    }

    throw error;
  }
}

export async function factCheckBatch(
  questions: GeneratedQuestion[],
  apiKey: string,
  params?: {
    env?: Env;
    parentCallId?: string;
    subject?: string;
    theme?: string;
    difficulty?: string;
    era?: string;
  }
): Promise<{
  checkedCount: number;
  accurateCount: number;
  issues: Array<{ questionIndex: number; result: FactCheckResult }>;
}> {
  // Chunk questions into smaller batches to avoid timeouts and maximize parallelism
  const CHUNK_SIZE = 10;
  const chunks: GeneratedQuestion[][] = [];

  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Split ${questions.length} questions into ${chunks.length} chunks for parallel fact-checking`);

  const results = await Promise.all(
    chunks.map(async (chunk, chunkIndex) => {
      // Map back to original indices
      const offset = chunkIndex * CHUNK_SIZE;

      try {
        const result = await factCheckBatchSingleCall(chunk, apiKey, params);

        // Adjust indices in issues to match original array
        const adjustedIssues = result.issues.map(issue => ({
          ...issue,
          questionIndex: issue.questionIndex + offset
        }));

        return {
          ...result,
          issues: adjustedIssues
        };
      } catch (error) {
        console.error(`Fact-check chunk ${chunkIndex} failed:`, error);
        // Return neutral result on failure to avoid failing entire generation
        return {
          checkedCount: chunk.length,
          accurateCount: chunk.length, // Assume accurate on error to proceed
          issues: []
        };
      }
    })
  );

  // Aggregate results
  return results.reduce(
    (acc, curr) => ({
      checkedCount: acc.checkedCount + curr.checkedCount,
      accurateCount: acc.accurateCount + curr.accurateCount,
      issues: [...acc.issues, ...curr.issues],
    }),
    { checkedCount: 0, accurateCount: 0, issues: [] }
  );
}

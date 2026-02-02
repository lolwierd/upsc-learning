import type {
  GeneratedQuestion,
  QuestionMetadata,
  GroundingSource,
  QuestionCategory,
  QuestionSubject,
} from "@mcqs/shared";

// ============================================================================
// GROUNDING SOURCE EXTRACTION
// ============================================================================

export interface GeminiGroundingMetadata {
  groundingChunks?: Array<{
    web?: {
      uri?: string;
      title?: string;
      domain?: string;
    };
  }>;
  groundingSupports?: unknown[];
  webSearchQueries?: string[];
}

/**
 * Extract grounding sources from Gemini's grounding metadata
 */
export function extractGroundingSources(
  groundingMetadata: GeminiGroundingMetadata | undefined
): GroundingSource[] {
  if (!groundingMetadata?.groundingChunks) {
    return [];
  }

  return groundingMetadata.groundingChunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk) => ({
      uri: chunk.web!.uri!,
      title: chunk.web?.title,
      domain: chunk.web?.domain,
    }));
}

// ============================================================================
// QUESTION METADATA ENRICHMENT
// ============================================================================

const VALID_CATEGORIES: QuestionCategory[] = ["direct-ca", "derived-static", "pure-static"];
const VALID_SUBJECTS: QuestionSubject[] = [
  "polity",
  "economy",
  "environment",
  "geography",
  "history",
  "science",
  "culture",
];

/**
 * Infer category from question content if not provided or invalid
 */
function inferCategory(question: GeneratedQuestion): QuestionCategory {
  const explanation = question.explanation || "";
  const questionText = question.questionText || "";

  // Check for Direct CA indicators
  const hasRelevanceTag = explanation.includes("[Relevance:");
  const hasSources = explanation.includes("Sources:");
  const hasCAKeywords =
    questionText.includes("In context of") ||
    questionText.includes("With reference to") ||
    /\b202[4-6]\b/.test(questionText); // Year mentions

  if (hasRelevanceTag || (hasSources && hasCAKeywords)) {
    return "direct-ca";
  }

  // If metadata suggests derived-static (has derivedFromTopic), trust it
  const meta = question.metadata as Partial<QuestionMetadata> | undefined;
  if (meta?.derivedFromTopic && typeof meta.derivedFromTopic === "string") {
    return "derived-static";
  }

  // Default to pure-static for traditional textbook questions
  return "pure-static";
}

/**
 * Infer subject from question content if not provided or invalid
 */
function inferSubject(question: GeneratedQuestion): QuestionSubject {
  const text = (
    question.questionText +
    " " +
    question.explanation
  ).toLowerCase();

  // Subject detection heuristics
  if (
    text.includes("constitution") ||
    text.includes("article") ||
    text.includes("parliament") ||
    text.includes("supreme court") ||
    text.includes("fundamental right") ||
    text.includes("directive principle") ||
    text.includes("amendment")
  ) {
    return "polity";
  }

  if (
    text.includes("gdp") ||
    text.includes("inflation") ||
    text.includes("rbi") ||
    text.includes("fiscal") ||
    text.includes("monetary") ||
    text.includes("budget") ||
    text.includes("taxation") ||
    text.includes("gst")
  ) {
    return "economy";
  }

  if (
    text.includes("ecosystem") ||
    text.includes("biodiversity") ||
    text.includes("wildlife") ||
    text.includes("forest") ||
    text.includes("pollution") ||
    text.includes("climate") ||
    text.includes("conservation") ||
    text.includes("species")
  ) {
    return "environment";
  }

  if (
    text.includes("river") ||
    text.includes("mountain") ||
    text.includes("plateau") ||
    text.includes("monsoon") ||
    text.includes("latitude") ||
    text.includes("longitude") ||
    text.includes("soil") ||
    text.includes("rainfall")
  ) {
    return "geography";
  }

  if (
    text.includes("dynasty") ||
    text.includes("empire") ||
    text.includes("freedom struggle") ||
    text.includes("revolt") ||
    text.includes("mughal") ||
    text.includes("british") ||
    text.includes("ancient") ||
    text.includes("medieval")
  ) {
    return "history";
  }

  if (
    text.includes("isro") ||
    text.includes("satellite") ||
    text.includes("nuclear") ||
    text.includes("technology") ||
    text.includes("vaccine") ||
    text.includes("ai") ||
    text.includes("biotechnology")
  ) {
    return "science";
  }

  if (
    text.includes("temple") ||
    text.includes("dance") ||
    text.includes("music") ||
    text.includes("art form") ||
    text.includes("festival") ||
    text.includes("heritage") ||
    text.includes("classical")
  ) {
    return "culture";
  }

  // Default to polity as it's most common in UPSC
  return "polity";
}

/**
 * Enrich a question with complete metadata, including grounding sources
 * and auto-inferred validation flags
 */
export function enrichQuestionWithGrounding(
  question: GeneratedQuestion,
  allGroundingSources: GroundingSource[]
): GeneratedQuestion {
  const explanation = question.explanation || "";
  const existingMeta = question.metadata as Partial<QuestionMetadata> | undefined;

  // Auto-detect validation flags
  const hasRelevanceTag = explanation.includes("[Relevance:");
  const hasSources = explanation.includes("Sources:");

  // Get or infer category
  let category: QuestionCategory = existingMeta?.category as QuestionCategory;
  if (!category || !VALID_CATEGORIES.includes(category)) {
    category = inferCategory(question);
  }

  // Get or infer subject
  let subject: QuestionSubject = existingMeta?.subject as QuestionSubject;
  if (!subject || !VALID_SUBJECTS.includes(subject)) {
    subject = inferSubject(question);
  }

  // Assign grounding sources only to direct-ca questions
  const groundingSources =
    category === "direct-ca" && allGroundingSources.length > 0
      ? allGroundingSources
      : undefined;

  // Build complete metadata
  const metadata: QuestionMetadata = {
    category,
    subject,
    groundingSources,
    hasGrounding: allGroundingSources.length > 0 && category === "direct-ca",
    hasRelevanceTag,
    hasSources,
    theme: existingMeta?.theme,
    derivedFromTopic:
      category === "derived-static" ? existingMeta?.derivedFromTopic : undefined,
  };

  return {
    ...question,
    metadata,
  };
}

/**
 * Enrich a batch of questions with grounding metadata
 */
export function enrichQuestionsWithGrounding(
  questions: GeneratedQuestion[],
  groundingMetadata: GeminiGroundingMetadata | undefined
): GeneratedQuestion[] {
  const allGroundingSources = extractGroundingSources(groundingMetadata);

  return questions.map((question) =>
    enrichQuestionWithGrounding(question, allGroundingSources)
  );
}

// ============================================================================
// METADATA STATISTICS
// ============================================================================

export interface QuestionCategoryStats {
  directCA: number;
  derivedStatic: number;
  pureStatic: number;
  total: number;
}

/**
 * Calculate category distribution statistics for a batch of questions
 */
export function calculateCategoryStats(
  questions: GeneratedQuestion[]
): QuestionCategoryStats {
  const stats: QuestionCategoryStats = {
    directCA: 0,
    derivedStatic: 0,
    pureStatic: 0,
    total: questions.length,
  };

  for (const question of questions) {
    const meta = question.metadata as QuestionMetadata | undefined;
    const category = meta?.category || "pure-static";

    switch (category) {
      case "direct-ca":
        stats.directCA++;
        break;
      case "derived-static":
        stats.derivedStatic++;
        break;
      case "pure-static":
        stats.pureStatic++;
        break;
    }
  }

  return stats;
}

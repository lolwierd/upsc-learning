import type { GeneratedQuestion } from "@mcqs/shared";

const DEFAULT_MAX_KEYWORDS = 8;

const ROMAN_NUMERAL_RE =
  /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

function isRomanNumeralToken(token: string): boolean {
  // Guard against pathological long tokens; Roman numerals in questions are short.
  if (token.length === 0 || token.length > 15) return false;
  return ROMAN_NUMERAL_RE.test(token);
}

const STOP_WORDS = new Set([
  // Articles
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "of",
  "in",
  "to",
  "for",
  "with",
  "on",
  "at",
  "by",
  "from",
  "as",
  "and",
  "or",
  "that",
  "this",
  "these",
  "those",
  // Question boilerplate
  "statement",
  "statements",
  "option",
  "options",
  "following",
  "above",
  "below",
  "correct",
  "incorrect",
  "consider",
  "which",
  "among",
  "how",
  "many",
  "given",
  "with",
  "reference",
  "regard",
  "regarding",
  "choose",
  "select",
  "best",
  "describes",
  "most",
  "appropriate",
  "pairs",
  "pair",
  "match",
  "code",
  "codes",
]);

// Normalize text for fingerprinting - removes noise, keeps semantics
// IMPORTANT: We keep numbers (article numbers, years, amendments) as they are critical for UPSC questions
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[^\w\s\d]/g, "") // Remove punctuation but keep digits
    .replace(/\b(the|a|an|is|are|was|were|of|in|to|for|with|on|at|by)\b/g, "") // Remove stop words
    .replace(/\b(statement|option|following|above|below|correct|incorrect)\b/g, "") // Remove MCQ boilerplate
    .replace(/\b[ivxlcdm]+\b/g, (m) => (isRomanNumeralToken(m) ? "" : m)) // Remove valid roman numerals only
    // NOTE: We do NOT normalize numbers - "Article 21" and "Article 22" must be distinct
    .trim()
    .replace(/\s+/g, " "); // Clean up again
}

function tokenizeForConcept(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s\d]/g, " ") // keep token boundaries
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const tokens = cleaned.split(" ").filter(Boolean);

  return tokens.filter((t) => {
    if (STOP_WORDS.has(t)) return false;
    if (isRomanNumeralToken(t)) return false;
    if (t.length <= 2 && !/\d/.test(t)) return false;
    if (/^[a-d]$/.test(t)) return false;
    return true;
  });
}

function hash32Hex(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

export function extractKeywords(text: string, maxKeywords = DEFAULT_MAX_KEYWORDS): string[] {
  const tokens = tokenizeForConcept(text);
  if (tokens.length === 0) return [];

  const counts = new Map<string, number>();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const diff = b[1] - a[1];
      if (diff !== 0) return diff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxKeywords)
    .map(([t]) => t)
    .sort();
}

export function calculateTextSimilarity(textA: string, textB: string): number {
  const a = new Set(tokenizeForConcept(textA));
  const b = new Set(tokenizeForConcept(textB));

  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Extract key entities/concepts from question text
function extractKeyEntities(text: string): string[] {
  // Common UPSC entities to detect
  const entityPatterns = [
    // Articles, Acts, Amendments
    /article\s*\d+[a-z]?/g,
    /\d+(?:st|nd|rd|th)\s+amendment/g,
    /act[,\s]+\d{4}/g,

    // Organizations
    /(?:rbi|sebi|isro|drdo|niti\s+aayog|election\s+commission|cag|upsc)/g,

    // Constitutional terms
    /(?:fundamental\s+rights?|dpsp|directive\s+principles?|preamble|schedules?)/g,

    // Geographic entities
    /(?:western\s+ghats|eastern\s+himalayas|gangetic\s+plain|deccan\s+plateau)/g,

    // Species/ecosystems
    /(?:tiger\s+reserve|national\s+park|wildlife\s+sanctuary|biosphere\s+reserve)/g,

    // Economic terms
    /(?:fiscal\s+deficit|gdp|inflation|repo\s+rate|monetary\s+policy)/g,

    // Proper nouns (capitalized words, likely names/places)
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g,
  ];

  const entities: string[] = [];
  for (const pattern of entityPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      entities.push(...matches.map((m) => m.toLowerCase().trim()));
    }
  }

  return [...new Set(entities)]
    .map((e) => e.trim())
    .filter(Boolean)
    // Filter generic title-case captures (e.g. "Consider", "Which") from the proper-noun regex.
    .filter((e) => !STOP_WORDS.has(e))
    .sort();
}

// Strip option prefix (A), B), etc.) from option text
function stripOptionPrefix(opt: string): string {
  return opt.replace(/^[A-D]\)\s*/i, "").trim();
}

// Generate a fingerprint for a question
export function generateFingerprint(question: GeneratedQuestion): string {
  // Combine question text and correct answer for fingerprint
  // Strip option prefix to avoid "A) ..." affecting the hash
  const correctAnswer = stripOptionPrefix(question.options[question.correctOption] || "");
  const combined = `${question.questionText} ${correctAnswer}`;
  const normalized = normalizeText(combined);

  return `fp_${hash32Hex(normalized)}`;
}

// Generate a concept key (sub-sub-topic proxy) based on entities + keywords.
export function generateConceptKey(question: GeneratedQuestion): string {
  const entities = extractKeyEntities(question.questionText).slice(0, 8);
  const keywords = extractKeywords(question.questionText, 8);

  // Combine, de-dupe, and limit to keep the signature stable.
  const combined = [...new Set([...entities, ...keywords])].sort().slice(0, 16);
  const keyStr = combined.join("|");
  return `ck_${hash32Hex(keyStr)}`;
}

// Generate a cluster hash based on key entities
export function generateClusterHash(question: GeneratedQuestion): string {
  // Keep for backward compatibility; align it to the new concept key.
  return generateConceptKey(question).replace(/^ck_/, "cl_");
}

// Calculate similarity between two questions (0-1 scale)
export function calculateSimilarity(
  q1: GeneratedQuestion,
  q2: GeneratedQuestion
): number {
  const text1 = normalizeText(q1.questionText);
  const text2 = normalizeText(q2.questionText);

  const words1 = new Set(text1.split(" ").filter((w) => w.length > 2));
  const words2 = new Set(text2.split(" ").filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Jaccard similarity
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// Check if a question is a duplicate of any in the existing set
export function findDuplicates(
  newQuestion: GeneratedQuestion,
  existingQuestions: GeneratedQuestion[],
  similarityThreshold = 0.7
): { isDuplicate: boolean; similarTo?: GeneratedQuestion; similarity: number } {
  const newFingerprint = generateFingerprint(newQuestion);

  for (const existing of existingQuestions) {
    // Exact fingerprint match
    if (generateFingerprint(existing) === newFingerprint) {
      return { isDuplicate: true, similarTo: existing, similarity: 1.0 };
    }

    // Similarity check
    const similarity = calculateSimilarity(newQuestion, existing);
    if (similarity >= similarityThreshold) {
      return { isDuplicate: true, similarTo: existing, similarity };
    }
  }

  return { isDuplicate: false, similarity: 0 };
}

// Filter out duplicates from a batch
export function filterDuplicates(
  newQuestions: GeneratedQuestion[],
  existingQuestions: GeneratedQuestion[],
  similarityThreshold = 0.7
): {
  unique: GeneratedQuestion[];
  duplicates: Array<{
    question: GeneratedQuestion;
    similarTo: GeneratedQuestion;
    similarity: number;
  }>;
} {
  const unique: GeneratedQuestion[] = [];
  const duplicates: Array<{
    question: GeneratedQuestion;
    similarTo: GeneratedQuestion;
    similarity: number;
  }> = [];

  // Combine existing + already-accepted new questions for checking
  const allExisting = [...existingQuestions];

  for (const question of newQuestions) {
    const result = findDuplicates(question, allExisting, similarityThreshold);

    if (result.isDuplicate && result.similarTo) {
      duplicates.push({
        question,
        similarTo: result.similarTo,
        similarity: result.similarity,
      });
    } else {
      unique.push(question);
      allExisting.push(question); // Add to check against subsequent questions
    }
  }

  return { unique, duplicates };
}

// Database operations for fingerprint storage
export interface FingerprintRecord {
  id: string;
  fingerprint: string;
  subject: string;
  theme?: string;
  questionTextPreview: string;
  questionId?: string;
}

export function createFingerprintRecord(
  question: GeneratedQuestion,
  subject: string,
  theme?: string,
  questionId?: string
): FingerprintRecord {
  return {
    id: crypto.randomUUID(),
    fingerprint: generateFingerprint(question),
    subject,
    theme,
    questionTextPreview: question.questionText.slice(0, 200),
    questionId,
  };
}

// SQL queries for fingerprint operations
export const FINGERPRINT_QUERIES = {
  checkExists: `
    SELECT id, question_text_preview 
    FROM question_fingerprints 
    WHERE fingerprint = ? AND subject = ?
  `,

  checkExistsBySubject: `
    SELECT id, fingerprint, question_text_preview 
    FROM question_fingerprints 
    WHERE subject = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `,

  // Use INSERT OR IGNORE to handle race conditions and duplicate fingerprints gracefully
  insert: `
    INSERT OR IGNORE INTO question_fingerprints (id, fingerprint, subject, theme, question_text_preview, question_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `,

  deleteOld: `
    DELETE FROM question_fingerprints 
    WHERE created_at < unixepoch() - (86400 * 90)
  `, // Delete fingerprints older than 90 days
};

export const CLUSTER_QUERIES = {
  loadBySubject: `
    SELECT cluster_hash, representative_text
    FROM question_clusters
    WHERE subject = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `,

  upsert: `
    INSERT INTO question_clusters (id, cluster_hash, subject, representative_text)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cluster_hash, subject) DO UPDATE SET
      question_count = question_count + 1,
      representative_text = excluded.representative_text,
      updated_at = unixepoch()
  `,
};

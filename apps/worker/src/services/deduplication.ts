import type { GeneratedQuestion } from "@mcqs/shared";

// Normalize text for fingerprinting - removes noise, keeps semantics
// IMPORTANT: We keep numbers (article numbers, years, amendments) as they are critical for UPSC questions
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/[^\w\s\d]/g, "") // Remove punctuation but keep digits
    .replace(/\b(the|a|an|is|are|was|were|of|in|to|for|with|on|at|by)\b/g, "") // Remove stop words
    .replace(/\b(statement|option|following|above|below|correct|incorrect)\b/g, "") // Remove MCQ boilerplate
    .replace(/\b[ivxlcdm]+\b/g, "") // Remove roman numerals (lowercase only to avoid matching words)
    // NOTE: We do NOT normalize numbers - "Article 21" and "Article 22" must be distinct
    .trim()
    .replace(/\s+/g, " "); // Clean up again
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

  return [...new Set(entities)].sort();
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

  // Simple hash function (32-bit) - sufficient for moderate scale
  // For high-volume generation, consider upgrading to SHA-256
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `fp_${Math.abs(hash).toString(16)}`;
}

// Generate a cluster hash based on key entities
export function generateClusterHash(question: GeneratedQuestion): string {
  const entities = extractKeyEntities(question.questionText);
  const entityStr = entities.slice(0, 5).join("|"); // Top 5 entities

  let hash = 0;
  for (let i = 0; i < entityStr.length; i++) {
    const char = entityStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return `cl_${Math.abs(hash).toString(16)}`;
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
    LIMIT 500
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

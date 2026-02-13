export const JSON_RESPONSE_MIME_TYPE = "application/json";

const QUESTION_TYPE_ENUM = ["standard", "statement", "match", "assertion"] as const;
const QUESTION_CATEGORY_ENUM = ["direct-ca", "derived-static", "pure-static"] as const;
const QUESTION_SUBJECT_ENUM = ["polity", "economy", "environment", "geography", "history", "science", "culture"] as const;

const QUESTION_METADATA_SCHEMA = {
  type: "OBJECT",
  description: "Metadata about the question category and subject.",
  propertyOrdering: ["category", "subject", "topicTag", "subtopicTag", "derivedFromTopic"],
  properties: {
    category: {
      type: "STRING",
      format: "enum",
      enum: QUESTION_CATEGORY_ENUM,
      description: "Question category: direct-ca (explicit current affairs), derived-static (trending topic, static framing), or pure-static (traditional textbook).",
    },
    subject: {
      type: "STRING",
      format: "enum",
      enum: QUESTION_SUBJECT_ENUM,
      description: "Primary subject being tested.",
    },
    topicTag: {
      type: "STRING",
      description: "Short topic label (3-8 words) identifying the core concept tested. E.g. 'Article 356 President\\'s Rule', 'Coral Reef Bleaching', 'Repo Rate Mechanism'. Must be specific enough to distinguish from other questions.",
    },
    subtopicTag: {
      type: "STRING",
      nullable: true,
      description: "Optional narrower sub-topic within the topicTag. E.g. if topicTag is 'Fundamental Rights' then subtopicTag could be 'Right to Privacy'.",
    },
    derivedFromTopic: {
      type: "STRING",
      nullable: true,
      description: "For derived-static questions only: briefly note the news event that triggered this topic selection.",
    },
  },
  required: ["category", "subject", "topicTag"],
} as const;

export const GENERATED_QUESTION_SCHEMA = {
  type: "OBJECT",
  description: "A single UPSC-style MCQ with one correct answer.",
  propertyOrdering: [
    "questionText",
    "questionType",
    "options",
    "correctOption",
    "explanation",
    "metadata",
  ],
  properties: {
    questionText: {
      type: "STRING",
      description: "The full question stem formatted for the given questionType.",
    },
    questionType: {
      type: "STRING",
      format: "enum",
      enum: QUESTION_TYPE_ENUM,
      description: "The UPSC-style question format.",
    },
    options: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Exactly four answer options labeled A) through D).",
    },
    correctOption: {
      type: "INTEGER",
      minimum: 0,
      maximum: 3,
      description: "Index of the correct option (0=A, 1=B, 2=C, 3=D).",
    },
    explanation: {
      type: "STRING",
      description: "Why the correct answer is correct and why the others are wrong.",
    },
    metadata: QUESTION_METADATA_SCHEMA,
  },
  required: ["questionText", "questionType", "options", "correctOption", "explanation", "metadata"],
  additionalProperties: false,
} as const;

export const GENERATED_QUESTION_ARRAY_SCHEMA = {
  type: "ARRAY",
  description: "List of generated UPSC-style MCQs.",
  items: GENERATED_QUESTION_SCHEMA,
} as const;

export const FACT_CHECK_SCHEMA = {
  type: "OBJECT",
  description: "Factual accuracy check for a single MCQ.",
  propertyOrdering: ["isAccurate", "confidence", "issues", "suggestions"],
  properties: {
    isAccurate: {
      type: "BOOLEAN",
      description: "Whether the question is factually accurate.",
    },
    confidence: {
      type: "STRING",
      format: "enum",
      enum: ["high", "medium", "low"],
      description: "Confidence in the accuracy assessment.",
    },
    issues: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of factual issues found (empty if accurate).",
    },
    suggestions: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Suggested fixes for the issues (empty if accurate).",
    },
  },
  required: ["isAccurate", "confidence", "issues", "suggestions"],
  additionalProperties: false,
} as const;

export const FACT_CHECK_ARRAY_SCHEMA = {
  type: "ARRAY",
  description: "Batch of factual accuracy checks aligned with input order.",
  items: FACT_CHECK_SCHEMA,
} as const;

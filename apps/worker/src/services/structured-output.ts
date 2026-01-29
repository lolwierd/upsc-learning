export const JSON_RESPONSE_MIME_TYPE = "application/json";

const QUESTION_TYPE_ENUM = ["standard", "statement", "match", "assertion"] as const;

export const GENERATED_QUESTION_SCHEMA = {
  type: "OBJECT",
  description: "A single UPSC-style MCQ with one correct answer.",
  propertyOrdering: [
    "questionText",
    "questionType",
    "options",
    "correctOption",
    "explanation",
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
  },
  required: ["questionText", "questionType", "options", "correctOption", "explanation"],
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

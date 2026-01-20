# UPSC MCQ Generator System

A comprehensive documentation of how the MCQ generation system works, including prompt engineering, validation, fact-checking, and deduplication.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Prompt Engineering](#prompt-engineering)
4. [Question Styles](#question-styles)
5. [Validation System](#validation-system)
6. [Fact-Checking with Gemini Pro](#fact-checking-with-gemini-pro)
7. [Deduplication System](#deduplication-system)
8. [Rendered Prompt Example](#rendered-prompt-example)
9. [API Usage](#api-usage)

---

## System Overview

The MCQ Generator creates high-quality UPSC Prelims-style questions using a multi-stage pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCQ GENERATION PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │  Prompt  │───▶│  Gemini  │───▶│  Auto-   │───▶│  Dedup-  │───▶│Validate│ │
│  │ Builder  │    │  Flash   │    │   Fix    │    │ lication │    │        │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│       │                                                               │      │
│       │                                                               ▼      │
│       │              ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│       │              │  Gemini  │◀───│  Fact-   │◀───│ Save Fingerprints│   │
│       │              │   Pro    │    │  Check   │    │                  │   │
│       │              └──────────┘    └──────────┘    └──────────────────┘   │
│       │                                                               │      │
│       ▼                                                               ▼      │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        FINAL QUESTIONS                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Models Used

| Stage | Model | Purpose |
|-------|-------|---------|
| Generation | `gemini-3-flash-preview` | Fast, cost-effective question generation |
| Fact-Check | `FACT_CHECK_MODEL` (default: `gemini-3-flash-preview`) | Verification of factual accuracy (configurable; can be set to `gemini-3-pro-preview` if available) |

---

## Architecture

### File Structure

```
apps/worker/src/
├── services/
│   ├── llm.ts              # Main generation orchestrator
│   ├── validator.ts        # Question validation + fact-checking
│   └── deduplication.ts    # Fingerprinting + duplicate detection
├── prompts/
│   └── index.ts            # Prompt templates and construction
└── routes/
    └── quiz.ts             # API endpoints

packages/db/migrations/
├── 0003_question_fingerprints.sql         # Deduplication tables (initial)
├── 0004_fix_fingerprint_uniqueness.sql    # Make fingerprints unique per subject
└── 0005_ai_generation_metrics.sql         # LLM observability/metrics (no prompts stored)
```

### Data Flow

1. **Request** → API receives subject, difficulty, styles, count
2. **Prompt Build** → Constructs detailed UPSC-style prompt
3. **Generation** → Gemini Flash generates questions as JSON
4. **Auto-Fix** → Normalizes options, fixes formatting
5. **Deduplication** → Filters questions matching existing fingerprints
6. **Validation** → Checks for absolute words, format issues, answer distribution
7. **Fact-Check** (optional) → Gemini Pro verifies factual accuracy
8. **Save** → Stores fingerprints for future deduplication
9. **Response** → Returns validated questions

---

## Prompt Engineering

The prompt system is designed to produce UPSC-authentic questions through several layers:

### 1. System Prompt

Sets the AI's role and critical requirements:

```
You are a UPSC Civil Services Preliminary Examination expert question 
generator with deep knowledge of the Indian civil services examination 
pattern, syllabus, and question standards.

YOUR ROLE:
- Generate questions that match the exact standard of actual UPSC Prelims
- Ensure 100% factual accuracy - someone's career depends on this
- Create elimination-proof questions that test genuine knowledge

UPSC EXAM CONTEXT:
- 100 questions, 200 marks (2 marks each)
- Negative marking: 0.66 marks deducted per wrong answer
- 56% of questions are statement-based
- ~8 match-the-following questions per paper
- ~15-20 Statement-I/II questions per paper
```

### 2. Prompt Layers

The main prompt is constructed from multiple layers:

```
┌─────────────────────────────────────────────┐
│           UPSC STEM TEMPLATES               │  ← Exact UPSC phrasing patterns
├─────────────────────────────────────────────┤
│           YEAR-WISE TRENDS                  │  ← 2021-2024 pattern evolution
├─────────────────────────────────────────────┤
│           PYQ EXAMPLES                      │  ← Real 2024 question samples
├─────────────────────────────────────────────┤
│       SUBJECT-SPECIFIC CONTEXT              │  ← Topic knowledge base
├─────────────────────────────────────────────┤
│       SUBJECT-SPECIFIC TRAPS                │  ← Common misconception patterns
├─────────────────────────────────────────────┤
│        DISTRACTOR BLUEPRINT                 │  ← 7 types of wrong option traps
├─────────────────────────────────────────────┤
│        DIFFICULTY CALIBRATION               │  ← Easy/Medium/Hard criteria
├─────────────────────────────────────────────┤
│         STYLE INSTRUCTIONS                  │  ← Statement/Match/Assertion formats
├─────────────────────────────────────────────┤
│        QUALITY REQUIREMENTS                 │  ← Non-negotiable rules
├─────────────────────────────────────────────┤
│          OUTPUT FORMAT                      │  ← JSON structure specification
└─────────────────────────────────────────────┘
```

### 3. UPSC Stem Templates

Enforces exact UPSC phrasing:

```
MANDATORY UPSC PHRASING PATTERNS:

STATEMENT QUESTIONS:
- "Consider the following statements:"
- "Consider the following statements regarding [topic]:"
- "With reference to [topic], consider the following statements:"

HOW MANY PATTERN (DOMINANT IN 2021-2024):
- "How many of the above statements is/are correct?"
- "How many of the above pairs are correctly matched?"

ANSWER CODE PHRASES:
- "Select the correct answer using the code given below:"
- "Which of the statements given above is/are correct?"
```

### 4. Distractor Blueprint

Seven trap types for creating UPSC-quality wrong options:

| Trap Type | Description | Example |
|-----------|-------------|---------|
| **Adjacent Concept** | Closely related but different | CBDC vs cryptocurrency |
| **Scope** | Correct principle, wrong jurisdiction | Union List vs State List |
| **Exception** | True generally but fails due to exception | "All fundamental rights for citizens" |
| **Terminology** | Similar-sounding terms | Prorogation vs Dissolution |
| **Time/Version** | Outdated vs current facts | Pre-amendment article numbers |
| **Authority** | Wrong institution mapping | ISRO vs DRDO vs DAE |
| **Geography** | Wrong habitat/region | Madagascar species vs African |

### 5. Subject-Specific Trap Libraries

Each subject has specific trap patterns:

**Polity:**
- Articles vs Parts vs Schedules confusion
- Money Bill vs Finance Bill vs Appropriation Bill
- Governor's discretionary vs constitutional duties
- Lapse vs Prorogation vs Dissolution
- Committee nature: Statutory vs Constitutional vs Ad-hoc

**Economy:**
- Money market vs Capital market instruments
- RBI tools: OMO vs Sterilization vs LAF vs MSF
- Fiscal deficit vs Revenue deficit vs Primary deficit
- CBDC properties, credit line vs term loan
- WTO vs IMF vs World Bank function mapping

**Environment:**
- Endemic vs Native vs Invasive species
- Country ↔ Species habitat mapping
- Biosphere reserves vs National Parks vs Wildlife Sanctuaries
- Convention vs Agency mapping: CITES vs Ramsar vs CBD
- IUCN categories confusion

**Art & Culture:**
- Classical dance forms confusion (8 forms)
- Folk dance ↔ State mapping
- Temple architecture: Nagara vs Dravida vs Vesara
- Painting schools: Mughal vs Rajput vs Pahari
- UNESCO sites categorization

**Science & Technology:**
- ISRO vs DRDO vs DAE agency mapping
- Fission vs Fusion vs Decay mechanisms
- Satellite types: GEO vs LEO vs MEO purposes
- Biotech: Gene editing vs GM vs traditional breeding

**History:**
- Event chronology traps
- Governor-General vs Viceroy period mapping
- Act provisions: Which act introduced what
- Freedom movement phases: Moderate vs Extremist vs Revolutionary

---

## Year-Wise Pattern Evolution (2011-2025)

Based on analysis of 1000+ PYQs from the scraped dataset, here's how UPSC question patterns evolved:

### 2011-2013: Foundation Period

**Characteristics:**
- Direct factual questions dominated (~60%)
- Simple statement format with 2-3 statements
- "Which of the following is correct?" style
- Classic match-the-following (A-1, B-2, C-3, D-4)
- Questions directly from NCERT textbooks

**Example patterns:**
```
"Under the constitution of India, which one of the following is not a fundamental duty?"

"The authorization for withdrawal of funds from Consolidated Fund must come from:"

"What is the difference between 'vote-on-account' and 'interim budget'?"
```

### 2014-2017: Transition Period

**Characteristics:**
- Statement questions increased to ~40-45%
- Introduction of 4-5 statement questions
- "Select the correct answer using the code given below" standardized
- Environment & Ecology questions increased significantly
- Current affairs integration began
- Extreme words ("only", "all", "always") used as traps

**Example patterns:**
```
"Consider the following statements... Which is/are correct?"
"In the context of [X], which of the following is/are true?"
"Which is NOT a feature of..."
```

### 2018-2020: Sophistication Period

**Characteristics:**
- Statement questions dominated (~50-55%)
- Rise of conceptual/application questions
- Tricky distractors using scope/exception traps
- Science & Technology questions increased
- "How many statements are correct?" pattern emerged
- Assertion-Reason format appeared more frequently

**Example patterns:**
```
"With reference to the Constitution of India, consider the following..."
"If the President exercises power under Article 356, then..."
Questions on committees with specific recommendations
```

### 2021-2023: Complexity Peak

**Characteristics:**
- "How many of the above" became DOMINANT (~50% of statement questions)
- Statement-I/Statement-II format for Economy, Environment, Science
- Match with "How many pairs correctly matched?"
- Distractors designed to defeat elimination strategies
- Focus on recent amendments, judgments, policies

**Key shift:** From "Which statements are correct?" to "How many are correct?"
- Forces knowledge of ALL statements, not just 2 to eliminate

**Example patterns:**
```
"How many of the above statements is/are correct? 
(a) Only one (b) Only two (c) All three (d) None"

"How many of the above pairs are correctly matched?"

Statement-I/Statement-II with causal relationship analysis
```

### 2024-2025: Current Standard

**Characteristics:**
- "How many of the above" is now ~60% of statement/match questions
- Statement-I/Statement-II format standardized for all subjects
- Match predominantly uses "How many pairs correctly matched?"
- Specific emphasis on:
  - Constitutional amendments (101st-106th)
  - Species habitat/country mapping
  - Party-leader/founder associations
  - Scientific concepts with misconceptions

**2024 specific patterns observed:**
```
"How many Delimitation Commissions have been constituted?" (factual count)

Party-Leader matching: "How many are correctly matched?"

Country-Animal habitat pairs (Brazil-Indri, Indonesia-Elk, Madagascar-Bonobo)

Statement-I/Statement-II on syndicated loans, CBDC, star lifecycle

"The organisms Cicada, Froghopper, Pond skater are:" (classification)
```

---

## Question Styles

### 1. Statement-Based (56% of UPSC paper)

**"How Many" Format (Dominant 2021-2024):**

```
Consider the following statements regarding [topic]:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]

How many of the above statements is/are correct?

A) Only one
B) Only two
C) All three
D) None
```

**Classic "Which Statements" Format:**

```
Consider the following statements:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]

Which of the statements given above is/are correct?

A) 1 only
B) 1 and 2 only
C) 2 and 3 only
D) 1, 2 and 3
```

### 2. Statement-I/Statement-II (15-20 per paper)

```
Consider the following statements:

Statement-I: [Statement of fact or claim]

Statement-II: [Related statement - explanation or independent fact]

Which one of the following is correct in respect of the above statements?

A) Both Statement-I and Statement-II are correct and Statement-II is 
   the correct explanation for Statement-I
B) Both Statement-I and Statement-II are correct and Statement-II is 
   not the correct explanation for Statement-I
C) Statement-I is correct but Statement-II is incorrect
D) Statement-I is incorrect but Statement-II is correct
```

### 3. Match the Following (8-12 per paper)

**"How Many Pairs" Format:**

```
Consider the following pairs:

Party               Its Leader
1. Bhartiya Jana Sangh    Dr. Shyama Prasad Mukherjee
2. Socialist Party        C. Rajagopalachari
3. Congress for Democracy Jagjivan Ram
4. Swatantra Party        Acharya Narendra Dev

How many of the above are correctly matched?

A) Only one pair
B) Only two pairs
C) Only three pairs
D) All four pairs
```

**Classic Match Format:**

```
Match List-I with List-II:

List-I              List-II
A. [Item 1]         1. [Description 1]
B. [Item 2]         2. [Description 2]
C. [Item 3]         3. [Description 3]
D. [Item 4]         4. [Description 4]

     A   B   C   D
(a)  1   2   3   4
(b)  2   1   4   3
(c)  3   4   1   2
(d)  4   3   2   1
```

### 4. Standard/Factual

```
Which of the following is NOT a feature of the Indian Constitution 
borrowed from the British Constitution?

A) Parliamentary system of government
B) Rule of law
C) Single citizenship
D) Bicameral legislature
```

---

## Validation System

Located in `apps/worker/src/services/validator.ts`

### Checks Performed

| Check | Type | Description |
|-------|------|-------------|
| Absolute Words | Warning | Detects "always", "never", "only" in wrong options |
| Option Format | Warning | Verifies A), B), C), D) prefixes |
| All/None Pattern | Warning | Flags "All of the above" usage |
| Statement-I/II Format | Warning | Validates option wording |
| "How Many" Options | Warning | Checks for "Only one", "Only two" etc. |
| Match Format | Warning | Validates matching option structure |
| Duplicate Options | Error | Detects identical option text |
| Answer Distribution | Batch Warning | Warns if >40% same answer |
| Missing Answers | Batch Warning | Warns if an option is never correct |

### Auto-Fix

The system automatically fixes:
- Missing option prefixes (A), B), C), D))
- Invalid correctOption values
- Incorrect questionType based on text analysis

---

## Fact-Checking with Gemini Pro

### How It Works

```typescript
// Checks ALL questions in the batch (quality over cost)
const factCheckResult = await factCheckBatch(questions, apiKey);
```

### Fact-Check Prompt

```
You are a UPSC exam expert fact-checker. Verify:

1. All facts, dates, numbers, article numbers are ACCURATE
2. The marked correct answer is DEFINITELY correct
3. All other options are DEFINITELY incorrect
4. No ambiguity exists - only ONE answer is correct

Respond with JSON:
{
  "isAccurate": true/false,
  "confidence": "high" | "medium" | "low",
  "issues": ["list of errors"],
  "suggestions": ["fixes"],
  "correctedAnswer": null or 0-3
}
```

### Output

```typescript
interface FactCheckResult {
  isAccurate: boolean;
  confidence: "high" | "medium" | "low";
  issues: string[];      // Factual errors found
  suggestions: string[]; // Corrections
}
```

- Fact-check runs on **every question** when enabled (no sampling) and is sent as a single batch request in local dev (no per-question fallback).
- Any question with `confidence: "low"` is flagged (even if `isAccurate: true`).

---

## Deduplication System

Located in `apps/worker/src/services/deduplication.ts`

### Fingerprinting Algorithm

1. **Normalize text:**
   - Lowercase
   - Remove punctuation
   - Remove stop words (the, a, an, is, are...)
   - Remove MCQ boilerplate (statement, option, following...)
   - Keep digits as-is (years/article numbers/amendment numbers matter for UPSC)

2. **Generate hash:**
   - Simple string hash of normalized text
   - Combines question text + correct answer

```typescript
function generateFingerprint(question: GeneratedQuestion): string {
  const combined = `${question.questionText} ${question.options[question.correctOption]}`;
  const normalized = normalizeText(combined);
  // Hash the normalized string
  return `fp_${hash.toString(16)}`;
}
```

### Entity Extraction

For semantic clustering, extracts key entities:
- Article numbers: `article 21`, `article 370`
- Amendments: `42nd amendment`, `73rd amendment`
- Organizations: `RBI`, `SEBI`, `ISRO`, `NITI Aayog`
- Geographic terms: `Western Ghats`, `Gangetic Plain`
- Economic terms: `fiscal deficit`, `repo rate`

### Database Schema

```sql
CREATE TABLE question_fingerprints (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    subject TEXT NOT NULL,
    theme TEXT,
    question_text_preview TEXT NOT NULL,
    question_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(fingerprint, subject)
);
```

**Note:** In this repo, fingerprint uniqueness is **per subject** (see migration `0004_fix_fingerprint_uniqueness.sql`).

### Similarity Detection

Uses Jaccard similarity for fuzzy matching:

```typescript
function calculateSimilarity(q1, q2): number {
  const words1 = new Set(normalize(q1).split(" "));
  const words2 = new Set(normalize(q2).split(" "));
  
  const intersection = words1 ∩ words2;
  const union = words1 ∪ words2;
  
  return intersection.size / union.size;
}
```

Default threshold: **0.7** (70% similar = duplicate)

**Important:** The current quiz generation flow uses **exact fingerprint matching** against stored fingerprints. The Jaccard similarity helpers exist but are not wired into `/api/quiz/generate` yet.

---

## Rendered Prompt Example

Here's what an actual prompt looks like for generating 5 Indian Polity questions:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    UPSC CIVIL SERVICES PRELIMINARY EXAMINATION                ║
║                         MCQ GENERATION TASK                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

GENERATE 5 UPSC-STANDARD MCQ QUESTIONS

SUBJECT: INDIAN POLITY
COVERAGE: Generate questions covering diverse important topics within Indian Polity.

MANDATORY UPSC PHRASING PATTERNS (Use these exact phrasings):

STATEMENT QUESTIONS:
- "Consider the following statements:"
- "Consider the following statements regarding [topic]:"
- "With reference to [topic], consider the following statements:"

HOW MANY PATTERN (VERY IMPORTANT - HIGH FREQUENCY IN 2021-2024):
- "How many of the above statements is/are correct?"
- "How many of the above pairs are correctly matched?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPSC YEAR-WISE PATTERN EVOLUTION (2013-2025):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2021-2024 ERA (CURRENT TREND - EMPHASIZE THIS):
- HEAVY "How many of the above" pattern (~60% of statement questions)
- Statement-I/Statement-II format in Economy & Environment
- Match/pairs with "how many correctly matched"
- Complex distractors testing fine distinctions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL UPSC PYQ EXAMPLES (USE AS STYLE REFERENCE ONLY - DO NOT COPY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXAMPLE 1 - "HOW MANY" STATEMENT PATTERN (2024 Polity):
"Consider the following pairs:
Party - Its Leader
1. Bhartiya Jana Sangh - Dr. Shyama Prasad Mukherjee
2. Socialist Party - C. Rajagopalachari
3. Congress for Democracy - Jagjivan Ram
4. Swatantra Party - Acharya Narendra Dev

How many of the above are correctly matched?
(a) Only one  (b) Only two  (c) Only three  (d) All four"
Answer: (b) Only two [Pairs 1 and 3 correct; 2 and 4 have swapped associations]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT-SPECIFIC CONTEXT & KNOWLEDGE BASE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INDIAN POLITY & GOVERNANCE (15-20% of UPSC Prelims, ~15-20 questions)

PRIMARY SOURCES:
- M. Laxmikanth's "Indian Polity" - THE standard reference
- NCERT Political Science (Class 11-12)
- Constitution of India (original text)

HIGH-WEIGHTAGE TOPICS:
1. Constitutional Framework: Preamble, Fundamental Rights, DPSPs
2. Union Executive: President, Vice President, PM & Council of Ministers
3. Parliament: Lok Sabha, Rajya Sabha, Legislative procedures
4. Judiciary: Supreme Court, High Courts, Judicial Review
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT-SPECIFIC TRAP PATTERNS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POLITY TRAP PATTERNS (Apply at least one per question):
- Articles vs Parts vs Schedules confusion
- Committee nature: Statutory vs Constitutional vs Ad-hoc
- Lapse vs Prorogation vs Dissolution implications
- Subject in Union/State/Concurrent list mapping
- Money Bill vs Finance Bill vs Appropriation Bill
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISTRACTOR DESIGN BLUEPRINT (MUST APPLY AT LEAST 2 PER QUESTION):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADJACENT CONCEPT TRAP: Use closely related but different concept
2. SCOPE TRAP: Correct principle but wrong scope/jurisdiction
3. EXCEPTION TRAP: True generally but fails due to known exception
4. TERMINOLOGY TRAP: Confusing similar-sounding terms
5. TIME/VERSION TRAP: Outdated fact vs latest update
6. AUTHORITY TRAP: Wrong institution/act/agency mapping
7. GEOGRAPHY/ENDEMISM TRAP: Wrong habitat/region associations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY CALIBRATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIFFICULTY: MEDIUM (Application Level - ~35% of actual UPSC paper)
- Requires connecting multiple concepts
- Tests understanding beyond memorization
- Distractors are plausible and test fine distinctions

═══════════════════════════════════════════════════════════════════════════════
GENERATE 3 QUESTION(S) IN THE FOLLOWING STYLE:
═══════════════════════════════════════════════════════════════════════════════

QUESTION STYLE: STATEMENT-BASED (56% OF UPSC PAPER - MOST IMPORTANT!)

"HOW MANY" FORMAT (DOMINANT IN 2021-2024 - USE THIS 60% OF THE TIME):

THREE-STATEMENT "HOW MANY" FORMAT (PREFERRED):
"Consider the following statements regarding [topic]:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]

How many of the above statements is/are correct?"

Options MUST be EXACTLY:
A) Only one
B) Only two
C) All three
D) None
...

═══════════════════════════════════════════════════════════════════════════════
GENERATE 2 QUESTION(S) IN THE FOLLOWING STYLE:
═══════════════════════════════════════════════════════════════════════════════

QUESTION STYLE: STATEMENT-I/STATEMENT-II (UPSC 2024 FORMAT)
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL QUALITY REQUIREMENTS (NON-NEGOTIABLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FACTUAL ACCURACY (MOST IMPORTANT):
   - Every fact, date, number, name MUST be 100% accurate
   - If uncertain about a fact, DO NOT include it

2. SINGLE CORRECT ANSWER:
   - There must be exactly ONE correct answer
   - No ambiguity - a subject expert should agree

3. ELIMINATION-PROOF DISTRACTORS:
   - DO NOT use absolute words (only, always, never, all, none) in wrong options
   
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT JSON):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return a JSON array with exactly 5 question objects.

Each object MUST have these exact fields:
{
  "questionText": "The complete question text...",
  "questionType": "standard" | "statement" | "match" | "assertion",
  "options": ["A) Option text", "B) Option text", "C) Option text", "D) Option text"],
  "correctOption": 0 | 1 | 2 | 3,
  "explanation": "Detailed explanation..."
}

NOW GENERATE 5 HIGH-QUALITY UPSC MCQ QUESTIONS:
```

---

## API Usage

### Generate Quiz

```typescript
import { generateQuiz } from "./services/llm";

const { questions, metrics } = await generateQuiz(env, {
  subject: "Indian Polity",
  theme: "Fundamental Rights",  // Optional: focus on specific topic
  difficulty: "medium",         // "easy" | "medium" | "hard"
  styles: ["statement", "assertion"],  // Question types to generate
  count: 10,
  apiKey: "your-gemini-key",    // Optional: uses env.GOOGLE_API_KEY if not provided
  enableFactCheck: true,        // Use Gemini Pro to verify ALL facts (default: false)
  enableDeduplication: true,    // Check against past questions (default: true)
  era: "current",               // Optional: generate in specific era's style
});
```

**HTTP API note:** The worker endpoint `POST /api/quiz/generate` currently accepts the request schema from `@mcqs/shared` and does **not** expose `enableFactCheck` / `enableDeduplication` toggles yet (dedup is on by default; fact-check is off by default).

### Era-Based Generation

Generate questions in different UPSC style eras:

```typescript
// Generate 2011-2013 style (simpler, more factual)
const { questions: easyQuestions } = await generateQuiz(env, {
  subject: "Indian Polity",
  era: "2011-2013",  // Foundation style
  // ...
});

// Generate 2014-2017 style (transition period)
const { questions: mediumQuestions } = await generateQuiz(env, {
  subject: "Environment",
  era: "2014-2017",  // More statements, current affairs
  // ...
});

// Generate current style (2024-2025)
const { questions: examQuestions } = await generateQuiz(env, {
  subject: "Economy",
  era: "current",    // or "2024-2025" - Heavy "How many", Statement-I/II
  // ...
});
```

**Available Eras:**
| Era | Style | Key Patterns |
|-----|-------|--------------|
| `2011-2013` | Foundation | Direct factual, simple 2-statement, NCERT-based |
| `2014-2017` | Transition | 3-4 statements, "1 and 2 only" codes, classic match |
| `2018-2020` | Sophistication | Assertion-Reason, conceptual, scope traps |
| `2021-2023` | Complexity | "How many", Statement-I/II emerging |
| `2024-2025` / `current` | Current | 60% "How many", all subjects use Statement-I/II |

### Response Format

```typescript
interface GeneratedQuestion {
  questionText: string;
  questionType: "standard" | "statement" | "match" | "assertion";
  options: [string, string, string, string];  // Always 4 options
  correctOption: 0 | 1 | 2 | 3;               // Index of correct answer
  explanation: string;
  metadata?: Record<string, unknown>;
}
```

### Example Output

```json
[
  {
    "questionText": "Consider the following statements regarding the Preamble of the Constitution:\n1. The Preamble was amended only once since the Constitution came into force.\n2. The words 'Socialist' and 'Secular' were added by the 44th Amendment Act.\n3. The Preamble is not enforceable in a court of law.\n\nHow many of the above statements is/are correct?",
    "questionType": "statement",
    "options": [
      "A) Only one",
      "B) Only two", 
      "C) All three",
      "D) None"
    ],
    "correctOption": 1,
    "explanation": "Statement 1 is correct: The Preamble was amended only once by the 42nd Amendment Act, 1976. Statement 2 is incorrect: 'Socialist' and 'Secular' were added by the 42nd Amendment Act, not the 44th. Statement 3 is correct: As per the Berubari Union case (1960) and reaffirmed in Kesavananda Bharati case (1973), the Preamble is not enforceable. Hence, only two statements are correct. (Source: M. Laxmikanth, Indian Polity)"
  }
]
```

---

## Configuration

### Environment Variables

```env
# Required
GOOGLE_API_KEY=your-gemini-api-key

# Database (Cloudflare D1)
DB=your-d1-binding
```

### Applying Database Migrations

```bash
# Apply the fingerprint table migration
pnpm db:migrate
```

---

## AI Metrics (Observability)

To help validate whether the generator is behaving correctly over time, the worker stores a small metrics record per quiz generation in D1 (no prompts or raw model outputs stored).

### Storage

- Table: `ai_generation_metrics` (migration `0005_ai_generation_metrics.sql`)
- Captures: model, subject/theme, requested vs returned counts, parse strategy, validation summary, dedup filtered count, timings, and token usage (when available)

### API

`GET /api/metrics/ai?limit=50&subject=polity&status=success`

Returns the most recent metrics rows for the authenticated user (or `anonymous` when running without Cloudflare Access).

---

## Performance & Cost Optimization

| Feature | Cost Impact | Notes |
|---------|-------------|-------|
| Generation (Flash) | Low | Rough estimate; verify against current provider pricing |
| Fact-Check (Pro) | Higher | Checks ALL questions (quality over cost) |
| Deduplication | Free | Local fingerprint comparison |
| Validation | Free | Local rule-based checks |

### Tips

1. **Disable fact-check** for quick practice quizzes where speed matters
2. **Enable fact-check** for serious prep - it checks EVERY question with Gemini Pro
3. **Deduplication** is always recommended to ensure variety
4. **Batch size**: 5-10 questions is optimal when fact-check is enabled
5. **Era selection**: Use older eras (2011-2017) for foundation building, current era for exam simulation

---

## Future Improvements

- [ ] Semantic similarity using embeddings (better duplicate detection)
- [ ] User feedback loop to improve prompts
- [ ] Subject-wise PYQ injection (RAG-lite)
- [ ] Difficulty auto-calibration based on user performance
- [ ] Current affairs integration with date validation

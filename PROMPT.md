# UPSC MCQ Generation Prompt System

This document explains the comprehensive prompt generation system used for creating UPSC Civil Services Preliminary Examination MCQ questions.

## Overview

The prompt system is designed to generate high-quality, UPSC-pattern-aligned multiple choice questions by combining:

1. **Base Exam Context** - UPSC Prelims format, marking scheme, and standard patterns
2. **Subject-Specific Themes** - Curated from 13 years of PYQ analysis (2013-2025)
3. **Strategic Trap Patterns** - Common confusion points and distractor design
4. **Era-Specific Instructions** - 2024-2025 pattern adherence
5. **Style Instructions** - Different question formats (statement, match, assertion, etc.)
6. **Quality Controls** - Factual accuracy, single correct answer, elimination-proof distractors
7. **Current Affairs Integration** - Always-on web search for recent events (default enabled)
8. **80-20 Coverage Strategy** - 80% from PYQ themes, 20% AI-predicted emerging topics

## Architecture

```
apps/worker/src/prompts/
├── index.ts                 # Main prompt generation logic
├── themes/
│   ├── index.ts             # Theme exports and helpers
│   ├── polity.ts            # Polity & Governance themes
│   ├── economy.ts           # Economy themes  
│   ├── environment.ts       # Environment & Ecology themes
│   ├── geography.ts         # Geography themes
│   ├── history.ts           # History & Culture themes
│   ├── science.ts           # Science & Technology themes
│   └── art.ts               # Art & Culture themes
└── subject-analysis.ts      # UPSC evolution patterns & strategic synthesis
```

## Theme Sources

All themes are extracted from comprehensive PYQ analysis stored in:
- `pyqs/GS/themes/consolidated/` - Consolidated theme files per subject
- `pyqs/GS/validation_reports/` - Gemini-validated theme accuracy reports

### Validation Status (as of January 2026)

| Subject | Grade | Status |
|---------|-------|--------|
| Polity & Governance | A | ✅ Pass |
| Economy | A | ✅ Pass |
| Environment & Ecology | A- | ✅ Pass |
| Geography | A | ✅ Pass |
| History & Culture | A | ✅ Pass |
| Science & Technology | A | ✅ Pass |
| Art & Culture | A | ✅ Pass |

## Prompt Parameters

```typescript
interface PromptParams {
  subject: string;           // e.g., "Polity", "Economy", "Environment"
  theme?: string;            // Optional focus area within subject
  difficulty: Difficulty;    // "easy" | "medium" | "hard"
  styles: StyleDistribution[]; // Question style distribution
  totalCount: number;        // Number of questions to generate
  enableCurrentAffairs?: boolean; // Default: true (always on)
  currentAffairsTheme?: string;   // Optional current affairs focus
}
```

> [!IMPORTANT]
> **Current Affairs is Always Enabled**: Web search integration is now enabled by default for all quiz generations. This ensures questions are grounded in recent developments and the AI can make informed predictions for UPSC 2026.

## Question Styles

| Style | Description |
|-------|-------------|
| `standard` | Direct factual questions |
| `statement` | "Which statement(s) is/are correct?" |
| `match` | Match pairs/columns format |
| `assertion` | Statement-I / Statement-II analysis |

## Prompt Structure

A generated prompt contains these sections (in order):

1. **Header** - Task description, subject, theme context
2. **Coverage Strategy** - 80-20 split (themes vs AI predictions) when no theme specified
3. **2026 Prelims Focus** - Modern framing and evolution guidance
4. **Content Balance Ratio** - 60% static + 40% dynamic guidance
5. **Relevance Filter** - What to prioritize/avoid
6. **Pattern Adherence** - 2024/2025 specific patterns
7. **UPSC Stem Templates** - Standard question formats
8. **Year Trends** - Historical pattern evolution
9. **Current Affairs** - Web search integration (always enabled)
10. **PYQ Examples** - Few-shot examples by style
11. **Subject-Specific Context** - Detailed knowledge base
12. **Subject Traps** - Common confusion patterns
13. **Subject Analysis** - UPSC evolution for this subject
14. **Subject Themes** - High-priority topics from PYQ analysis
15. **Strategic Notes** - Trap cues and distractor design
16. **Distractor Blueprint** - How to create plausible wrong answers
17. **Difficulty Calibration** - Easy/medium/hard adjustments
18. **Style Instructions** - Format-specific requirements
19. **Quality Requirements** - Accuracy and verification checklist
20. **Output Format** - JSON schema for response

## Example Usage

```typescript
import { getPrompt } from './prompts/index.js';

// With specific theme focus
const promptWithTheme = getPrompt({
  subject: 'Polity',
  theme: 'Constitutional Bodies',  // 75% from this theme, 25% adjacent
  difficulty: 'medium',
  styles: [
    { style: 'statement', count: 2 },
    { style: 'match', count: 1 }
  ],
  totalCount: 3
  // enableCurrentAffairs defaults to true
});

// Without specific theme (uses 80-20 strategy)
const promptWithoutTheme = getPrompt({
  subject: 'Economy',
  difficulty: 'hard',
  styles: [{ style: 'standard', count: 5 }],
  totalCount: 5
  // 80% from curated PYQ themes
  // 20% from AI predictions for UPSC 2026
});
```

## Coverage Strategy

### When Theme is Specified
The prompt instructs:
> "Prefer this theme but include ~25% adjacent subtopics for breadth"

### When No Theme is Specified (80-20 Split)
The prompt instructs:
```
COVERAGE STRATEGY FOR [SUBJECT]:
- 80% from the provided SUBJECT THEMES below (proven high-yield from 2013-2025 PYQs)
- 20% from YOUR OWN PREDICTION of emerging topics likely to appear in UPSC 2026
  (consider: recent legislation, constitutional developments, international events,
   government initiatives, scientific breakthroughs not yet tested by UPSC)

For the 20% prediction slot: Think about what a UPSC paper-setter in 2026 would
consider "fresh yet UPSC-worthy" — topics gaining policy traction but not yet examined.
Use your web search capability to identify current developments that could become exam topics.
```

This ensures questions aren't purely backward-looking but include forward-looking predictions based on current developments.

---

## Complete Example: Rendered Prompt

Below is a **truncated** example of a rendered prompt for Polity with "Constitutional Bodies" theme.
The actual prompt is ~40,000 characters (~1,000+ lines).

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    UPSC CIVIL SERVICES PRELIMINARY EXAMINATION                ║
║                         MCQ GENERATION TASK                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

GENERATE 3 UPSC - STANDARD MCQ QUESTIONS

SUBJECT: POLITY
SPECIFIC FOCUS: "Constitutional Bodies" - Prefer this theme but include ~25% 
adjacent subtopics for breadth within Polity.


╔══════════════════════════════════════════════════════════════════════════════╗
║                    🎯 CRITICAL: 2026 PRELIMS FOCUS 🎯                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

YOUR GOAL: Generate questions that would likely appear in UPSC PRELIMS 2026.

⚠️ IMPORTANT DISTINCTION:
- The theme data provided comes from analyzing 2013-2025 PYQs
- BUT you are NOT trying to recreate old PYQ patterns
- Use theme data for TOPIC COVERAGE, apply ONLY 2024-2025 FRAMING

WHAT THIS MEANS:
✗ DO NOT: Generate deep/specific questions in the style of 2013-2017
✓ DO: Take topics from themes but frame them with 2024-2025 sophistication
✗ DO NOT: Focus on outdated schemes, ended programs, or historical minutiae
✓ DO: Focus on currently relevant provisions, active policies, recent developments

UPSC EVOLUTION INSIGHT:
- Static content has REDUCED by ~50% compared to 2013-2017 era
- Questions now test UNDERSTANDING + APPLICATION, not just RECALL
- Cross-subject integration has INCREASED significantly
- Current affairs TRIGGERS static concepts (not standalone static)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CONTENT BALANCE: 60% STATIC + 40% DYNAMIC (Aspirational Target)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

~60% STATIC CONCEPTS (with modern framing):
- Constitutional provisions, fundamental geography, ecological principles
- Historical facts, scientific concepts, cultural heritage
- BUT: Frame with sophisticated 2024-style question structures
- NOT: Pure recall like "In which year was X established?"

~40% DYNAMIC LINKAGE (current affairs triggered):
- Static concepts triggered by recent developments (last 18 months)
- Policy changes, recent amendments, new schemes, international developments


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 RELEVANCE FILTER FOR 2026 PRELIMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⛔ AVOID generating questions on:
- Schemes that have ENDED or MERGED (unless historically tested)
- Topics with DECLINING frequency in 2021-2024 PYQs
- Very deep static minutiae that UPSC has moved away from
- Specific dates/numbers unless absolutely fundamental

✅ PRIORITIZE generating questions on:
- Topics with INCREASING frequency in 2021-2024 (see trends)
- Cross-linkage questions (Environment + Economy, Polity + Current Affairs)
- Constitutional provisions with RECENT amendments or interpretations
- Application-based understanding over pure recall


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ STRICT 2024/2025 PATTERN ADHERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your FRAMING STYLE, TRAPPING LOGIC, and DISTRACTOR DESIGN must mirror 2024/2025 PYQs.

KEY 2024/2025 PATTERNS:
❶ "HOW MANY CORRECT" is now DOMINANT (replace simple "which is correct")
❷ 4-5 statements per question (increased complexity)
❸ Mixed true/false within same question
❹ Cross-domain integration (Polity + Current Affairs)
❺ Definition-based traps (subtle wording differences)


[... UPSC STEM TEMPLATES SECTION ...]
[... YEAR TRENDS SECTION ...]
[... PYQ EXAMPLES SECTION ...]


═══════════════════════════════════════════════════════════════════════════════
SUBJECT-SPECIFIC CONTEXT & KNOWLEDGE BASE:
═══════════════════════════════════════════════════════════════════════════════

[Standard Polity context about Constitution, amendments, etc.]


═══════════════════════════════════════════════════════════════════════════════
SUBJECT ANALYSIS (UPSC EVOLUTION) - FROM DETAILED PYQ ANALYSIS:
═══════════════════════════════════════════════════════════════════════════════

POLITY & GOVERNANCE ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TREND EVOLUTION (2013-2025):

PURE CONSTITUTIONAL ERA (2013-2016):
- Heavy emphasis on constitutional articles, parts, and schedules
- Fundamental Rights and DPSP were staple topics
- Governor's powers, President's ordinance-making frequently tested
- Parliament vs State Legislature powers
- Constitutional amendment procedures

TRANSITION ERA (2017-2019):
- Shift toward practical governance issues
- Introduction of statutory body questions
- Constitutional schemes vs Government schemes distinction
- Local government and Panchayati Raj prominence
- Judicial review and activism questions

[... continues with detailed evolution ...]


═══════════════════════════════════════════════════════════════════════════════
SUBJECT THEMES & PATTERNS (HIGH-PRIORITY TOPICS FOR QUESTION GENERATION):
═══════════════════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POLITY THEMES (Extracted from 13 Years of UPSC PYQs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HIGH-FREQUENCY THEMES:

CONSTITUTIONAL PROVISIONS & AMENDMENTS:
- Constitutional Amendment Process: Article 368 nuances
- 73rd/74th Amendments: Panchayati Raj evolution
- Part IX-A: Municipalities and Urban Local Bodies
- Fifth and Sixth Schedules: Tribal administration
- Article 370 and its abrogation (2019 development)
- Anti-defection law: Tenth Schedule specifics

PARLIAMENTARY PROCEDURES:
- Money Bill vs Finance Bill distinction (Article 110)
- Appropriation Bill; Consolidated Fund operations
- Parliamentary committees: PAC, Estimates, Ethics Committee
- Question Hour; Zero Hour procedures
- Joint Session convening and historical instances
- Lok Sabha vs Rajya Sabha exclusive powers

CONSTITUTIONAL BODIES:
- Anti-corruption: Lokpal jurisdiction, PM coverage
- Statutory bodies and parent ministry mapping
- Constitutional vs statutory bodies: NCBC/NHRC
- Election Commission: party symbol disputes
- Finance Commission: 15th FC recommendations, horizontal devolution
- Finance Commission composition, tenure, functions

[... full Polity themes continue ...]

CRIMINAL JUSTICE SYSTEM:
- Prisons Act 1894: state subject, prison conditions
- Judicial custody vs Police custody: time limits
- Parole vs Furlough: conditions, granting authority
- Legal Services: NALSA eligibility, free legal aid
- Victims Rights: compensation, court procedures

STATUTORY BODIES & PARENT MINISTRY:
- Tea Board: Ministry of Commerce mapping
- Coal Controller: Coal Ministry functions
- Central Electricity Authority: energy planning
- IRDAI, PFRDA: regulatory status
- Commodity Boards: Coffee, Rubber, Spices origins

POLITICAL THEORY DEFINITIONS:
- "State" definition: elements of statehood
- "Liberty" concept: positive vs negative liberty
- "Constitutional Government": rule of law basis
- "Law" definition: Hart vs Austin theories
- "Constitutionalism" vs "Constitution"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRATEGIC NOTES & TRAP CUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORE STRATEGY - "SWITCHBOARDS" & "TRAPS":
- Focus on articles that behave like 'switchboards': 13, 32/226, 72/161, 110/117, 123/213, 200, 239AA, 280, 323A/323B
- Parliamentary Process: Distinguish bill taxonomy (ordinary, money, finance I/II)
- Study Tip: Pair a body with: Article/Statute → Composition/Tenure → Removal → Money Source → One non-obvious power

[... continues with strategic notes ...]


═══════════════════════════════════════════════════════════════════════════════
STRATEGIC NOTES & TRAP CUES (USE THESE FOR DISTRACTOR DESIGN):
═══════════════════════════════════════════════════════════════════════════════

POLITY TRAP PATTERNS (Use these to create sophisticated distractors):

STATUTORY VS CONSTITUTIONAL BODIES TRAP:
- Many candidates confuse statutory bodies with constitutional bodies
- Trap: NCBC (Constitutional now) vs NHRC (Statutory)
- Trap: Lokpal (Statutory) vs CAG (Constitutional)
- Use: "Which of the following is a Constitutional body?"

LOK SABHA VS RAJYA SABHA EXCLUSIVE POWERS TRAP:
- Money Bills can only be introduced in Lok Sabha
- But All-India Services require Rajya Sabha resolution (Art 312)
- Trap: Mix up which house has which exclusive power

RESERVATION & EQUALITY TRAPS:
- Sub-classification of SCs/STs: recent SC developments
- Creamy Layer applicability to different categories
- EWS reservation: criteria and judicial challenges


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THEME USAGE GUIDANCE (How to Apply the Above):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When generating questions:
1. SELECT topics from the theme lists above
2. APPLY 2024-25 question framing (not old styles)
3. USE strategic traps for distractor design
4. AVOID topics marked as declining in trend analysis
5. PREFER cross-linkage where possible


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISTRACTOR BLUEPRINT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADJACENT CONCEPT TRAP:
   Use a closely related but different concept
   Examples: Constitutional vs Statutory body | Article 32 vs Article 226

2. SCOPE TRAP:
   Correct principle but wrong scope/jurisdiction
   Examples: "State Government" powers listed as "Central" powers

3. TEMPORAL TRAP:
   Correct fact but wrong time period/amendment
   Examples: Powers before vs after constitutional amendments

4. SPECIFICITY TRAP:
   True general statement but false in specific context
   Examples: "Governor can reserve any bill" (specific exceptions exist)

CRITICAL RULE: Wrong options must be *nearly defensible* to a half-prepared 
student, but falsifiable by one precise fact.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY CALIBRATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MEDIUM DIFFICULTY GUIDELINES:
- Tests concepts that require reading beyond NCERT
- Distractors are sophisticated but eliminable with careful analysis
- 2-3 statements for statement questions
- Questions bridge basic concepts to application
- Use of adjacent concept traps


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE DISTRIBUTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════════════════════════════════════
GENERATE 2 QUESTION(S) IN THE FOLLOWING STYLE:
═══════════════════════════════════════════════════════════════════════════════

STATEMENT FORMAT (2-4 statements, test if correct):
[Detailed statement question format instructions...]

═══════════════════════════════════════════════════════════════════════════════
GENERATE 1 QUESTION(S) IN THE FOLLOWING STYLE:
═══════════════════════════════════════════════════════════════════════════════

MATCH THE FOLLOWING FORMAT:
[Detailed match question format instructions...]


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL QUALITY REQUIREMENTS (NON-NEGOTIABLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FACTUAL ACCURACY (MOST IMPORTANT):
   - Every fact, date, number, name MUST be 100% accurate
   - Cross-reference with NCERT textbooks and standard references
   - Constitutional articles, amendment numbers must be exact

2. SINGLE CORRECT ANSWER:
   - There must be exactly ONE correct answer
   - All distractors must be DEFINITIVELY incorrect

3. ELIMINATION-PROOF DISTRACTORS:
   - DO NOT use absolute words (only, always, never, all, none) in wrong options
   - Distractors should be plausible misconceptions


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT JSON):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return a JSON array with exactly 3 question objects.

Each object MUST have these exact fields:
{
  "questionText": "The complete question text...",
  "questionType": "standard" | "statement" | "match" | "assertion",
  "options": ["A) Option text", "B) Option text", "C) Option text", "D) Option text"],
  "correctOption": 0 | 1 | 2 | 3,
  "explanation": "Detailed explanation with sources..."
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOW GENERATE 3 HIGH-QUALITY UPSC MCQ QUESTIONS:
```

---

## Key Features

### 1. PYQ-Driven Theme Selection
All themes are extracted from actual UPSC PYQ papers (2013-2025), validated by Gemini Pro, ensuring relevance to actual exam patterns.

### 2. 2024-2025 Pattern Adherence
The prompt emphasizes modern questioning patterns:
- "How many correct" format dominance
- Cross-subject integration
- Application over recall
- Current affairs triggers

### 3. Strategic Distractor Design
Built-in trap patterns guide the LLM to create sophisticated wrong options that test genuine understanding, not just recognition.

### 4. Subject-Specific Context
Each subject includes:
- High-frequency themes with specific examples
- Strategic notes and trap cues
- Year-wise evolution analysis
- 2025-26 watchlist topics

### 5. Quality Controls
Multiple verification checkpoints ensure:
- Factual accuracy
- Single correct answer
- Elimination-proof distractors
- UPSC language standards

### 6. Always-On Current Affairs
- Web search is **enabled by default** for all generations
- Ensures questions are grounded in recent developments
- Powers the 20% prediction capability for emerging topics
- Users can optionally specify a current affairs focus area

### 7. 80-20 Coverage Strategy
When no specific theme is provided:
- **80%** of questions come from curated PYQ themes (2013-2025)
- **20%** are AI-predicted emerging topics for UPSC 2026
- Uses web search to identify current developments that could become exam topics

---

## Files Modified/Created

| File | Purpose |
|------|---------|
| `apps/worker/src/prompts/index.ts` | Main prompt generation logic |
| `apps/worker/src/prompts/themes/*.ts` | Subject-specific theme files |
| `apps/worker/src/prompts/subject-analysis.ts` | UPSC evolution and strategic synthesis |
| `pyqs/GS/validation_reports/*.md` | Gemini validation reports for each subject |

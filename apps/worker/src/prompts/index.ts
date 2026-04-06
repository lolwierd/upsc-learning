import type { QuestionStyle } from "@mcqs/shared";
import { getSubjectThemes, getSubjectStrategicTraps } from "./themes/index.js";
import { getSubjectAnalysis, getStrategicSynthesis } from "./subject-analysis.js";

interface StyleDistribution {
  style: QuestionStyle;
  count: number;
}

export type Difficulty = "standard" | "hard" | "brutal";

interface PromptParams {
  subject: string;
  theme?: string;
  styles?: StyleDistribution[]; // Now optional - auto-distributes if not provided
  totalCount: number;
  enableCurrentAffairs?: boolean; // Enable current affairs context injection
  currentAffairsTheme?: string; // Optional focus area for current affairs
  excludeTopics?: string[]; // Topics already covered — model should avoid these
  regenerationIndex?: number; // 0 = initial call, >0 = regeneration call index
  shuffleSeed?: number; // Seed for theme randomization (changes per call)
  previousSearchQueries?: string[]; // Web search queries from prior calls — model should search differently
  forceStatic?: boolean; // Force pure-static generation only
  difficulty?: Difficulty; // Cognitive difficulty knob (default: "standard")
}

// ============================================================================
// DIFFICULTY DIRECTIVE — COGNITIVE HARDNESS KNOB
// ============================================================================
// Injected near the top of every generation prompt (normal, static-only, random).
// This is the highest-priority section after system instructions — it overrides
// the model's natural tendency to produce safe, easy questions.

function buildDifficultyDirective(difficulty: Difficulty = "standard"): string {
  if (difficulty === "standard") {
    return `
DIFFICULTY TARGET: STANDARD (UPSC 2024-2025 baseline)
- Match the average difficulty of UPSC Prelims 2024-2025 PYQs.
- A well-prepared candidate (NCERT + one standard reference) should be able to answer ~60% confidently.
`;
  }

  const isBrutal = difficulty === "brutal";
  const label = isBrutal ? "BRUTAL (top 10% of UPSC PYQs)" : "HARD (UPSC 2023-2024 toughest tier)";
  const allTrueAllFalsePct = isBrutal ? "50%" : "40%";
  const fourPlusStmtPct = isBrutal ? "50%" : "35%";
  const elimSeconds = isBrutal ? "10" : "5";
  const factualCap = isBrutal ? "5%" : "10%";

  return `
═══════════════════════════════════════════════════════════════════════════════
DIFFICULTY TARGET: ${label}  ←  HIGHEST PRIORITY OVERRIDE
═══════════════════════════════════════════════════════════════════════════════

This directive OVERRIDES any softer guidance below about "avoid deep minutiae"
or "test concepts not facts." For this generation, you MUST produce questions
at the upper bound of UPSC difficulty. Easy or generic questions will be REJECTED.

HARD-MODE RULES (NON-NEGOTIABLE — apply to every question):

1. ELIMINATION-PROOFING (the single most important rule):
   - Each of the 4 options must be defensible to a candidate who has read NCERT
     + one standard reference (Laxmikanth / Spectrum / Shankar IAS) ONCE.
   - Only a candidate who knows the SPECIFIC sub-clause, exception, year,
     threshold, or footnote should be able to eliminate confidently.
   - Self-check: "Could a 70th-percentile aspirant eliminate any option in
     under ${elimSeconds} seconds?" If yes, REWRITE that option.
   - No option may be eliminated by detecting absolute words (only/always/never/all/none).
     If you catch such a word in a wrong option, REWRITE it with a softer hedged
     formulation that is still factually false on a precise point.

2. STATEMENT-QUESTION HARDENING:
   - At least ${allTrueAllFalsePct} of statement questions must have ALL statements true OR
     ALL statements false (forces complete knowledge — eliminates the
     "1-true-1-false → pick 'both'" shortcut).
   - At least ${fourPlusStmtPct} of statement questions must use 4 OR 5 statements
     (not 2 or 3). Use the "How many of the above" format for these.
   - Every wrong statement must use ONE of these specific traps:
     {Scope, Exception, Terminology, Time/Version, Authority, Endemism, Quantity}
     and the explanation MUST name the trap used (e.g., "Statement 2 uses an
     Exception trap: Article 19(1)(g) is restricted by Art 19(6) for...").

3. PRECISION-BIAS (override any "avoid deep minutiae" guidance):
   - The correct answer must rest on a SPECIFIC fact: an exact year, sub-clause,
     section number, threshold value, named exception, scientific name,
     committee report number, or sub-paragraph reference.
   - Generic "concept understanding" questions are TOO EASY for this difficulty.
   - Prefer asking about: post-amendment article wording, exception clauses,
     specific endemism (genus + region), production-rank by state, exact years
     of treaties, sub-categories of IUCN status, named provisions of acts.

4. STYLE BIAS:
   - Cap pure factual / "standard" questions at ${factualCap} of the batch.
   - Push the rest into Statement (4-5 stmt "How many"), Match ("How many pairs"
     where the answer is frequently "Only one" or "None"), and Statement-I/II
     where Statement-II is true but does NOT explain Statement-I.
   - Country-Species, Party-Founder, Article-Provision, Scheme-Ministry pairs
     are gold for this difficulty — use them aggressively.

5. DISTRACTOR CONSTRUCTION:
   - In every question, AT LEAST 2 distractors must independently use a different
     trap pattern from the SUBJECT TRAP LIBRARY below.
   - At least 1 distractor per question must be a "factually-correct-but-irrelevant"
     option (true statement about the topic, just not the answer to THIS question).

6. ANSWER DISTRIBUTION:
   - Across the batch, the answer key must be roughly uniform across A/B/C/D.
   - For "How many" questions, the correct answer must NOT default to "Only two"
     — use "Only one", "All four", and "None" frequently. "None" is especially
     valuable: forces candidates to verify every item rather than eliminate.

7. SELF-VERIFICATION (perform mentally before emitting each question):
   - Could a candidate guess this correctly without knowing the specific fact? → Rewrite.
   - Are 2+ options trivially true or trivially false? → Rewrite.
   - Does any wrong option use an absolute word? → Rewrite that option.
   - Is the trap pattern named in the explanation? → Add it.

═══════════════════════════════════════════════════════════════════════════════
`;
}

// ============================================================================
// PER-SUBJECT CURRENT AFFAIRS RATIOS (From PYQ Analysis 2013-2025)
// ============================================================================

/**
 * Per-subject total CA ratio (direct-CA + derived-static combined).
 * Validated by Gemini 3 Pro classification of 900 UPSC GS1 PYQs (2017-2025).
 * Using post-2016 data only — UPSC has trended more CA-heavy in recent years.
 * The direct:derived split within CA is ~37.5% : 62.5% (preserving 15:25 ratio).
 */
const SUBJECT_CA_RATIOS: Record<string, number> = {
  history:     0.17,  // 17% CA  — mostly static, some derived-static from heritage/policy events
  art_culture: 0.23,  // 23% CA  — volatile (SD=29); heritage designations, cultural events
  geography:   0.44,  // 44% CA  — disasters, resource discoveries, mapping exercises linked to news
  polity:      0.49,  // 49% CA  — amendments, schemes, judgments, governance reforms
  environment: 0.63,  // 63% CA  — climate summits, conservation policy, species in news
  economy:     0.71,  // 71% CA  — budget, RBI policy, trade, fiscal events dominate
  science:     0.80,  // 80% CA  — missions, emerging tech, defense, space; heavily CA-driven
  international_relations: 0.90,  // 90% CA  — geopolitics, treaties, orgs; highest CA ratio of any subject (validated: 90% in 2022-2025 era, 83% in 2017-2021)
};

function getSubjectCARatio(subject: string): { directCA: number; derivedStatic: number; pureStatic: number } {
  const totalCA = SUBJECT_CA_RATIOS[subject] ?? 0.45;
  const directCA = totalCA * 0.375;      // 37.5% of CA portion
  const derivedStatic = totalCA * 0.625; // 62.5% of CA portion
  const pureStatic = 1 - totalCA;
  return { directCA, derivedStatic, pureStatic };
}

// ============================================================================
// THEME RANDOMIZATION UTILITIES
// ============================================================================

/**
 * Simple seeded PRNG (mulberry32). Returns a function that produces [0,1) floats.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG.
 */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Parse a theme string into { header, items[] } groups.
 * Headers are lines that DON'T start with "- " (after trimming).
 * Items are lines that start with "- ".
 */
function parseThemeGroups(themeString: string): { header: string; items: string[] }[] {
  const lines = themeString.split('\n');
  const groups: { header: string; items: string[] }[] = [];
  let currentHeader = '';
  let currentItems: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('- ')) {
      currentItems.push(trimmed);
    } else {
      if (currentItems.length > 0) {
        groups.push({ header: currentHeader, items: currentItems });
        currentItems = [];
      }
      currentHeader = trimmed;
    }
  }
  if (currentHeader || currentItems.length > 0) {
    groups.push({ header: currentHeader, items: currentItems });
  }
  return groups;
}

/**
 * Reassemble theme groups back into a string, optionally shuffling items within
 * each group and the groups themselves.
 */
function reassembleThemes(groups: { header: string; items: string[] }[], rng: () => number): string {
  const shuffledGroups = shuffleArray(groups, rng);
  return shuffledGroups
    .map(g => {
      const shuffledItems = shuffleArray(g.items, rng);
      return g.header ? `${g.header}\n${shuffledItems.join('\n')}` : shuffledItems.join('\n');
    })
    .join('\n\n');
}

/**
 * Select a random subset of theme items, distributing a target count across groups.
 * Ensures at least 1 item per group (maintains breadth) then distributes remaining
 * slots proportionally to group size.
 */
function subsetThemesToCount(
  groups: { header: string; items: string[] }[],
  targetCount: number,
  rng: () => number
): { header: string; items: string[] }[] {
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  if (targetCount >= totalItems) {
    // Target is >= total items, just shuffle within groups
    return groups.map(g => ({ header: g.header, items: shuffleArray(g.items, rng) }));
  }

  // Phase 1: guarantee 1 item per group
  const nonEmptyGroups = groups.filter(g => g.items.length > 0);
  const guaranteed = Math.min(nonEmptyGroups.length, targetCount);
  let remaining = targetCount - guaranteed;

  // Phase 2: distribute remaining slots proportionally to group size
  return nonEmptyGroups.map(g => {
    const proportion = totalItems > 0 ? g.items.length / totalItems : 0;
    const extra = Math.round(remaining * proportion);
    const count = Math.min(g.items.length, 1 + extra);
    const shuffled = shuffleArray(g.items, rng);
    return { header: g.header, items: shuffled.slice(0, count) };
  }).filter(g => g.items.length > 0);
}

/**
 * Filter theme groups to only include those matching a theme keyword.
 * Matches group headers case-insensitively against the theme string.
 * Returns all groups if no match found (fallback to full list).
 */
function filterThemeGroupsByTheme(
  groups: { header: string; items: string[] }[],
  theme: string
): { header: string; items: string[] }[] {
  const themeLower = theme.toLowerCase();

  // Map of theme keywords to group header patterns
  // Broader matching to include related groups (e.g., religion/philosophy for ancient, temples for both)
  const themeKeywords: Record<string, string[]> = {
    'ancient': ['ancient', 'indus', 'vedic', 'maurya', 'gupta', 'sangam', 'harappa', 'buddhis', 'religion', 'philosophy', 'temple', 'architecture'],
    'medieval': ['medieval', 'sultanate', 'mughal', 'vijayanagara', 'bhakti', 'sufi', 'christianity', 'religion', 'philosophy', 'temple', 'architecture'],
    'modern': ['modern', 'british', 'freedom', 'reform', 'literary', 'colonial', 'music', 'performing'],
  };

  // Find matching keywords from the theme
  const matchPatterns: string[] = [];
  for (const [keyword, patterns] of Object.entries(themeKeywords)) {
    if (themeLower.includes(keyword)) {
      matchPatterns.push(...patterns);
    }
  }

  // If no keyword matched, try direct header matching
  if (matchPatterns.length === 0) {
    matchPatterns.push(themeLower);
  }

  const filtered = groups.filter(g => {
    const headerLower = g.header.toLowerCase();
    return matchPatterns.some(p => headerLower.includes(p));
  });

  // Fall back to full list if nothing matched
  if (filtered.length === 0) return groups;
  return filtered;
}

/**
 * Shuffle and subset a theme string proportional to question count.
 * - Initial call (regenIndex 0): max(count*4, 25) themes, shuffled
 * - Regeneration calls (regenIndex > 0): max(count*2, 15) themes from full list, shuffled
 * - When a theme is provided, groups are filtered to match before subsetting
 */
function processThemeString(
  themeString: string,
  seed: number,
  regenerationIndex: number,
  totalCount?: number,
  theme?: string
): string {
  if (!themeString) return themeString;
  const rng = seededRandom(seed + regenerationIndex * 7919); // different seed per regen call
  let groups = parseThemeGroups(themeString);

  // Filter groups by theme if provided (e.g., "Ancient History" → only ancient groups)
  if (theme) {
    groups = filterThemeGroupsByTheme(groups, theme);
  }

  if (totalCount != null && totalCount > 0) {
    // Proportional subsetting based on question count
    const targetCount = regenerationIndex > 0
      ? Math.max(totalCount * 2, 15)  // Regen: tighter subset, still from full pool
      : Math.max(totalCount * 4, 25); // Initial: generous but capped
    const subsetted = subsetThemesToCount(groups, targetCount, rng);
    return reassembleThemes(subsetted, rng);
  }

  // Legacy fallback: no count provided
  if (regenerationIndex > 0) {
    const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
    const subsetted = subsetThemesToCount(groups, Math.round(totalItems * 0.5), rng);
    return reassembleThemes(subsetted, rng);
  }
  return reassembleThemes(groups, rng);
}

/**
 * Build the excluded-topics prompt section.
 */
function buildExcludeTopicsSection(excludeTopics: string[]): string {
  if (!excludeTopics.length) return '';
  const topicList = excludeTopics.map(t => `- ${t}`).join('\n');
  return `
ALREADY COVERED TOPICS (DO NOT REPEAT — generate questions on DIFFERENT themes):
${topicList}

CRITICAL: The above topics have already been generated. You MUST choose DIFFERENT
sub-topics, concepts, and themes. Do not rephrase the same topic — pick entirely
new areas within the subject. Explore lesser-known, niche, or under-tested areas.
`;
}

// ============================================================================
// SEARCH DIVERSITY — PREVIOUS QUERY EXCLUSION
// ============================================================================

/**
 * Build the search diversity section for the prompt.
 * Uses previous search query exclusion: after each generation call, we collect
 * the web search queries the model used (from grounding metadata) and pass them
 * to subsequent calls so the model knows what it already searched for and is
 * forced to explore different topics.
 *
 * On the initial call (no previous queries), this returns empty — we let the
 * model search freely the first time.
 */
function buildSearchDiversitySection(
  previousSearchQueries: string[],
): string {
  if (previousSearchQueries.length === 0) return '';

  const uniqueQueries = [...new Set(previousSearchQueries)];
  // Cap at 20, keeping most recent queries (appended last) since those are most likely being repeated
  const queriesForPrompt = uniqueQueries.slice(-20);

  return `
SEARCH DIVERSITY (IMPORTANT — DO NOT REPEAT PREVIOUS SEARCHES):

You have already performed these web searches in prior generation attempts:
${queriesForPrompt.map(q => `- "${q}"`).join('\n')}

DO NOT repeat these searches or minor variations of them. You MUST search for
ENTIRELY DIFFERENT topics, events, or policy areas. Explore niche, under-reported,
or recently emerging developments that the above searches would not have covered.

Tips for finding fresh content:
- Search for specific bills, judgments, missions, or schemes by name
- Look into lesser-known government initiatives and policy changes
- Explore recent PIB press releases, gazette notifications, ministry announcements
- Search for developments in areas you haven't covered yet
`;
}

// ============================================================================
// UPSC 2024-2025 REALISTIC STYLE DISTRIBUTION
// ============================================================================
// Prep mix target:
// - Standard/Factual: ~40%
// - Non-factual (total): ~60%
//   - Statement questions: ~35%
//   - Match-the-following: ~15%
//   - Assertion-Reason: ~10%
// ============================================================================

function calculateStyleDistribution(totalCount: number): StyleDistribution[] {
  // Calculate counts based on prep mix target
  const factualCount = Math.round(totalCount * 0.40);
  const remainingCount = totalCount - factualCount;
  const statementCount = Math.round(totalCount * 0.35);
  const matchCount = Math.round(totalCount * 0.15);
  const assertionCount = remainingCount - statementCount - matchCount;

  const distribution: StyleDistribution[] = [];

  if (statementCount > 0) {
    distribution.push({ style: "statement", count: statementCount });
  }
  if (matchCount > 0) {
    distribution.push({ style: "match", count: matchCount });
  }
  if (assertionCount > 0) {
    distribution.push({ style: "assertion", count: assertionCount });
  }
  if (factualCount > 0) {
    distribution.push({ style: "factual", count: factualCount });
  }

  return distribution;
}

// Export for use in other modules
export { calculateStyleDistribution };

// ============================================================================
// RANDOM MODE PROMPT (Multi-Subject Quiz Generation)
// ============================================================================

function getRandomModePrompt(params: PromptParams): string {
  const { theme, styles, currentAffairsTheme, totalCount, excludeTopics, regenerationIndex = 0, shuffleSeed, previousSearchQueries = [], forceStatic = false, difficulty = "standard" } = params;
  const difficultyDirective = buildDifficultyDirective(difficulty);
  const styleDistribution = styles || calculateStyleDistribution(totalCount);
  const seed = shuffleSeed ?? Date.now();

  // Apply theme randomization to subject-specific theme data
  // In random mode, each subject gets themes proportional to its share of the quiz
  const allSubjects = ['polity', 'economy', 'environment', 'geography', 'history', 'science', 'art_culture', 'international_relations'] as const;
  const perSubjectCount = Math.max(Math.round(totalCount / allSubjects.length), 3);
  const processedThemes = allSubjects.map(s => ({
    subject: s,
    themes: processThemeString(getSubjectThemes(s), seed, regenerationIndex, perSubjectCount),
  })).filter(t => t.themes);

  // Build randomized combined themes section (injected later in prompt)
  const randomizedThemesSection = processedThemes.length > 0
    ? `RANDOMIZED SUBJECT THEMES (HIGH-PRIORITY TOPICS — order varies per generation):\n\n${
        processedThemes.map(t => `${t.subject.toUpperCase()} THEMES:\n${t.themes}`).join('\n\n')
      }`
    : '';

  // Build style instructions — map "factual" to "standard" so model sees the same name as questionType output
  const styleDisplayName = (style: QuestionStyle): string =>
    style === "factual" ? "standard (direct factual)" : style;
  const styleInstructions = styleDistribution
    .map(({ style, count }) => `- ${styleDisplayName(style)}: ${count} questions`)
    .join('\n');

  if (forceStatic) {
    return `
UPSC PRELIMS 2026 - RANDOM MODE: PURE STATIC ONLY

${difficultyDirective}

MISSION: Generate ${totalCount} high-quality UPSC Prelims questions across multiple subjects.

STATIC-ONLY OVERRIDE (HIGHEST PRIORITY):
- Generate ONLY pure-static questions.
- Do NOT use current affairs for topic selection.
- Do NOT use recent or ongoing developments as the reason to choose a topic.
- Do NOT mention recent events, budgets, summits, policy announcements, or other news developments.
- Historical or long-settled static topics remain allowed if they are treated as timeless syllabus content.
- Do NOT include [Relevance: ...] tags.
- Do NOT include Sources or URLs.
- Every question's metadata.category must be "pure-static".

${theme ? `
THEMATIC FOCUS: "${theme}"
- Apply this only as a static syllabus focus.
- Do NOT interpret it as a current-affairs theme.
` : ""}

${randomizedThemesSection}

${excludeTopics?.length ? buildExcludeTopicsSection(excludeTopics) : ''}

QUESTION STYLE DISTRIBUTION:
${styleInstructions}

OUTPUT REQUIREMENTS:
- Generate EXACTLY ${totalCount} questions in valid JSON array format.
- metadata.category must be "pure-static" for every question.
- metadata.derivedFromTopic must be omitted.
- No explanation may contain [Relevance:] or Sources:.

NOW GENERATE ${totalCount} PURE-STATIC MULTI-SUBJECT QUESTIONS:
`;
  }

  return `
UPSC PRELIMS 2026 - RANDOM MODE: MULTI-SUBJECT QUIZ GENERATION

${difficultyDirective}

MISSION: Generate ${totalCount} high-quality UPSC Prelims questions across
multiple subjects, prioritizing topics likely to appear in May 2026 exam.

SUBJECT DISTRIBUTION STRATEGY (INTELLIGENT, NOT UNIFORM)

UPSC-WEIGHTED DISTRIBUTION (Target for ${totalCount} questions):
- Polity & Governance: 15-20% → ${Math.round(totalCount * 0.175)} questions (~3-4 in 20Q)
- Environment & Ecology: 15-20% → ${Math.round(totalCount * 0.175)} questions (~3-4 in 20Q)
- Geography: 12-18% → ${Math.round(totalCount * 0.15)} questions (~2-4 in 20Q)
- History: 10-18% → ${Math.round(totalCount * 0.14)} questions (~2-4 in 20Q)
- Economy: 10-15% → ${Math.round(totalCount * 0.125)} questions (~2-3 in 20Q)
- Science & Tech: 5-15% → ${Math.round(totalCount * 0.10)} questions (~1-3 in 20Q)
- Art & Culture: 5-10% → ${Math.round(totalCount * 0.075)} questions (~1-2 in 20Q)

SMART SELECTION RULES:
- Prioritize high-weightage subjects (Polity, Environment, Geography)
- For small quizzes (<20Q): Focus on 4-5 subjects only
- For larger quizzes (≥20Q): Include all 7 subjects
- Favor cross-subject questions (Environment + Geography, Polity + Current Affairs)
- DO NOT force even distribution - follow UPSC exam patterns

TOPIC SELECTION (MANDATORY — THEME LIST IS YOUR ASSIGNMENT)

The RANDOMIZED SUBJECT THEMES section below contains a curated subset of topics
selected from 13 years of UPSC PYQ analysis. This subset changes every generation
to ensure broad coverage over time.

90% of questions MUST be drawn directly from the theme items listed below.
Each question should map to a specific theme item — treat the list as your assignment.
Only 10% may come from your own predictions of likely 2026 topics.
Do NOT ignore the theme list in favor of topics you find easier to generate.

${theme ? `
THEMATIC FOCUS: "${theme}"

THEME APPLICATION STRATEGY:
- 60% of questions should relate to this theme across relevant subjects
- 40% general high-yield topics for comprehensive coverage
- Connect theme across multiple disciplines

Example - Theme "Climate Change":
  → Environment: Climate science, Paris Agreement, India's NDCs
  → Geography: Climate patterns, regional impacts, monsoons
  → Polity: Climate legislation, institutional mechanisms
  → Economy: Green finance, carbon markets, renewable subsidies
  → Science: Climate modeling, renewable tech, carbon capture

Example - Theme "Current Affairs 2025":
  → Polity: Recent amendments, new schemes, SC judgments
  → Environment: COP30, policy updates, conservation efforts
  → Economy: Budget highlights, RBI policies, trade deals
  → Science: Space missions, tech breakthroughs
  → History: Recent discoveries, anniversaries
` : `

UPSC 2026 PREDICTION MODE (No specific theme)

PREDICTION STRATEGY:
- Focus on developments from JANUARY 2025 to PRESENT (Jan 2026)
- Prioritize topics with high exam probability:
  - Legislation passed in 2025-2026
  - International summits involving India
  - Major policy launches and reforms
  - Significant Supreme Court judgments
  - Scientific missions and achievements
  - Environmental milestones and conventions

CURRENT AFFAIRS QUESTION DESIGN (for CA questions per subject ratios above):
- Use 2025-2026 events as the primary source (most recent)
- Can include significant 2024 events if still relevant
- MUST use Google Search to verify facts and get sources

${buildSearchDiversitySection(previousSearchQueries)}

IMPORTANT: This section applies ONLY to the current affairs questions (per subject ratios), NOT to static questions
`}

CRITICAL CONTENT DISTRIBUTION (PER-SUBJECT CA RATIOS FROM PYQ ANALYSIS 2013-2025):

Different subjects have different CA intensities. Apply these ratios PER SUBJECT:

| Subject        | Total CA | Direct CA | Derived Static | Pure Static |
|----------------|----------|-----------|----------------|-------------|
| History        | 17%      | 6%        | 11%            | 83%         |
| Art & Culture  | 23%      | 9%        | 14%            | 77%         |
| Geography      | 44%      | 17%       | 28%            | 56%         |
| Polity         | 49%      | 18%       | 31%            | 51%         |
| Environment    | 63%      | 24%       | 39%            | 37%         |
| Economy        | 71%      | 27%       | 44%            | 29%         |
| Science & Tech | 80%      | 30%       | 50%            | 20%         |

History/Art & Culture questions should be mostly static.
Science/Economy/Environment questions should have MAJORITY CA integration — most questions derive from current events.

GENERATE THREE CATEGORIES PER SUBJECT:

1. DIRECT CURRENT AFFAIRS (per subject % above):
   - Question explicitly mentions recent events from 2025-2026
   - Examples: "In context of Union Budget 2025-26...", "With reference to COP30..."
   - MUST include [Relevance: ...] tag in explanation
   - MUST include "Sources: <URL>" with verified links
   - Test static concepts THROUGH current events

2. DERIVED STATIC (per subject % above):
   - Topic selected BECAUSE it's in news, but question framed purely from textbooks
   - NO mention of recent events in question text
   - NO [Relevance] tag, NO Sources needed
   - Examples:
     * News: "Governor delays bill" → Question: "Consider the following about Article 200..."
     * News: "SEBI warnings on F&O" → Question: "Which of the following about derivatives is correct?"
     * News: "Heatwave alerts" → Question: "Wet-bulb temperature is associated with..."
   - The CA connection is invisible to the student - they see a pure static question

3. PURE STATIC (per subject % above):
   - Traditional textbook questions with NO current affairs influence
   - Topics selected from standard UPSC syllabus regardless of news
   - Geography (rivers, climate), History (dynasties, movements), Core Polity (articles)
   - Examples: "The Gupta period is known for...", "Western Ghats are characterized by..."
   - NO phrases like "In context of recent..." or "With reference to 2025..."

DIRECT CA QUESTIONS (per the subject-specific ratios above):

${CURRENT_AFFAIRS_CONTEXT}

${currentAffairsTheme ? `
CURRENT AFFAIRS FOCUS: "${currentAffairsTheme}"

Prioritize this theme when selecting current affairs topics. Use web search
to find recent developments (2025+) related to this theme.
` : ''}

DERIVED STATIC QUESTIONS (per subject ratios above):
- Topics trending in news (last 12 months) but framed as pure static questions
- Use CA to SELECT topic, use NCERT/textbooks to FRAME question
- NO explicit mention of dates, events, or recent developments
- Subject-wise examples:
  * Polity: Governor powers, Anti-Defection Law, Money Bills (when in news)
  * Economy: MSP, RBI tools, SEBI regulations (when being debated)
  * Environment: Specific pollutants, Conservation Acts (when in headlines)
  * Science: Technologies under government missions (Quantum, AI, Space)
  * Geography: Regions in geopolitical news, Critical minerals
  * History/Culture: NO derived static (these are always pure static)

For random mode, spread the direct CA across subjects per their ratios:
- Polity: Recent amendments, schemes, judgments (explicit reference)
- Environment: Climate summits, conservation policies (explicit reference)
- Economy: Budget, RBI policies, trade deals (explicit reference)
- Science: Missions, breakthroughs, policy updates (explicit reference)

COMBINED KNOWLEDGE BASE (All Subjects)

You have access to specialized knowledge for all UPSC subjects:

${getSubjectAnalysis('polity')}

${getSubjectAnalysis('environment')}

${getSubjectAnalysis('geography')}

${getSubjectAnalysis('history')}

${getSubjectAnalysis('economy')}

${getSubjectAnalysis('science')}

${getSubjectAnalysis('art_culture')}

CROSS-SUBJECT TRAP PATTERNS (Elimination-Proof Distractors)

Apply subject-specific trap patterns based on question topic:

POLITY TRAPS:
${getSubjectStrategicTraps('polity')}

ENVIRONMENT TRAPS:
${getSubjectStrategicTraps('environment')}

GEOGRAPHY TRAPS:
${getSubjectStrategicTraps('geography')}

HISTORY TRAPS:
${getSubjectStrategicTraps('history')}

ECONOMY TRAPS:
${getSubjectStrategicTraps('economy')}

SCIENCE TRAPS:
${getSubjectStrategicTraps('science')}

CULTURE TRAPS:
${getSubjectStrategicTraps('art_culture')}

${randomizedThemesSection}

${excludeTopics?.length ? buildExcludeTopicsSection(excludeTopics) : ''}

QUESTION QUALITY STANDARDS (NON-NEGOTIABLE)

1. UPSC 2024-2025 PATTERN ADHERENCE:
   ${UPSC_STEM_TEMPLATES}

2. QUESTION STYLE DISTRIBUTION:
${styleInstructions}

3. DISTRACTOR DESIGN (Apply trap patterns from above):
   ${DISTRACTOR_BLUEPRINT}
   - Each distractor must be plausible and elimination-proof
   - Use subject-specific confusions (similar years, adjacent articles, etc.)
   - Mix factually correct but irrelevant options
   - Apply cross-subject traps where relevant

4. FACTUAL ACCURACY:
   - Every fact must be 100% accurate regardless of subject
   - Constitutional articles, amendment numbers, years must be exact
   - Verify scientific facts, geographical data, historical dates
   - Cross-reference government sources for current affairs

5. EXPLANATION REQUIREMENTS:
   - Start by identifying the subject area (e.g., "This Polity question...")
   - Link current affairs to underlying static concepts
   - For current affairs questions, include:
     [Relevance: <event + date + source>]
     Sources: <URL from 2025+>

OUTPUT FORMAT

Generate EXACTLY ${totalCount} questions in valid JSON array format:

[
  {
    "questionText": "Question with proper UPSC phrasing...",
    "questionType": "standard|statement|match|assertion",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctOption": 0,
    "explanation": "Clear explanation mentioning subject area, static concept, and sources if current affairs...",
    "metadata": {
      "category": "direct-ca|derived-static|pure-static",
      "subject": "polity|economy|environment|geography|history|science|culture|international_relations",
      "derivedFromTopic": "Optional: For derived-static, briefly note the news event that made this topic relevant"
    }
  },
  ...
]

METADATA REQUIREMENTS:
- category: MUST match the question type (direct-ca has [Relevance], derived-static does not)
- subject: Primary subject being tested (polity, economy, environment, geography, history, science, culture, international_relations)
- topicTag: Short topic label (3-8 words) identifying the core concept tested
- subtopicTag: Optional narrower sub-topic within the topicTag
- derivedFromTopic: ONLY for derived-static questions - briefly note the news event that triggered this topic selection

questionType CLASSIFICATION RULE (CRITICAL — WRONG TYPE = REJECTED QUESTION):
- "standard": ONLY for direct one-line factual stems with NO numbered sub-items.
  Examples: "Which of the following...", "The irrigation device called 'Araghatta' was..."
- "statement": ANY question containing numbered statements (1., 2., 3.) with
  "Which/How many of the above is/are correct?" — EVEN IF the style requested was "standard".
  If you write numbered statements, you MUST set questionType to "statement".
- "match": ANY question with "Match List-I with List-II" or "Consider the following pairs"
- "assertion": ANY question with "Statement-I / Statement-II" or "Assertion (A) / Reason (R)"
A question with the WRONG questionType will be rejected and regenerated. Label correctly.

FINAL CHECKLIST BEFORE GENERATION:
- Subject distribution follows UPSC pattern (not uniform)
- CA ratios applied PER SUBJECT (see table above): History ~6% CA, Environment ~42% CA, etc.
- Direct CA questions include [Relevance] and Sources
- Derived Static questions: CA topics with static framing, NO [Relevance]
- Pure Static: NO CA influence at all
- High-yield topics prioritized
- Cross-subject linkages included where relevant
- All questions maintain UPSC 2024-2025 standards
- Distractors use subject-specific trap patterns
- ${theme ? 'Theme applied across questions' : 'Prediction mode focuses on likely 2026 topics'}
- Factual accuracy verified across all subjects

═══════════════════════════════════════════════════════════════════════════════
CRITICAL FINAL INSTRUCTION (HIGHEST PRIORITY - OVERRIDE ALL OTHER GUIDELINES):
═══════════════════════════════════════════════════════════════════════════════

Out of ${totalCount} questions, apply PER-SUBJECT CA ratios:

| Subject        | Direct CA | Derived Static | Pure Static |
|----------------|-----------|----------------|-------------|
| History        | 2%        | 4%             | 94%         |
| Geography      | 5%        | 9%             | 86%         |
| Art & Culture  | 7%        | 12%            | 81%         |
| Science & Tech | 12%       | 20%            | 68%         |
| Polity         | 12%       | 20%            | 68%         |
| Economy        | 15%       | 24%            | 61%         |
| Environment    | 16%       | 26%            | 58%         |

CATEGORY 1: DIRECT CA (per subject %)
  - Explicitly mention recent events: "In context of COP30...", "With reference to Budget 2025-26..."
  - MUST include [Relevance: ...] in explanation
  - MUST include "Sources: <URL>" with verified links from 2025+
  - Applies most to Economy/Environment/Science, least to History/Geography

CATEGORY 2: DERIVED STATIC (per subject %)
  - Topic selected because it's trending in news (last 12 months)
  - Question framed purely from textbook - NO mention of recent events
  - NO [Relevance] tag, NO Sources needed
  - Looks identical to pure static question to the student

CATEGORY 3: PURE STATIC (per subject %)
  - Traditional UPSC syllabus topics regardless of news cycle
  - NO current affairs influence in topic selection
  - History/Geography questions should be almost entirely in this category

DO NOT confuse categories. The key distinction:
- Direct CA: Event VISIBLE in question text
- Derived Static: Event influenced topic choice, but INVISIBLE in question
- Pure Static: Topic chosen from syllabus, NO event influence

Maintain the PER-SUBJECT ratios from the table above. These are calibrated from 13 years of PYQ data.

NOW GENERATE ${totalCount} MULTI-SUBJECT QUESTIONS:
`;
}

function getStaticOnlySubjectPrompt(params: PromptParams): string {
  const {
    subject,
    theme,
    styles: providedStyles,
    totalCount,
    excludeTopics,
    regenerationIndex = 0,
    shuffleSeed,
    difficulty = "standard",
  } = params;

  const seed = shuffleSeed ?? Date.now();
  const styles = providedStyles && providedStyles.length > 0
    ? providedStyles
    : calculateStyleDistribution(totalCount);

  const subjectContext = getSubjectContext(subject);
  const subjectTraps = getSubjectTraps(subject);
  const rawSubjectThemes = getSubjectThemes(subject);
  const subjectThemes = processThemeString(rawSubjectThemes, seed, regenerationIndex, totalCount, theme);
  const subjectStrategicTraps = getSubjectStrategicTraps(subject);
  const subjectAnalysis = getSubjectAnalysis(subject);
  const strategicSynthesis = getStrategicSynthesis();

  const styleInstructions = styles
    .map(({ style, count }) => {
      return `
GENERATE ${count} QUESTION(S) WITH questionType="${style === "factual" ? "standard" : style}":
${STYLE_INSTRUCTIONS[style]} `;
    })
    .join("\n");

  const staticThemeContext = theme
    ? `STATIC SYLLABUS FOCUS: "${theme}"
    - Generate questions from this theme area only.
    - Interpret "${theme}" as a textbook syllabus focus, not as a current-affairs trigger.
    - Every question MUST be drawn from the provided static theme list.`
    : `STATIC TOPIC SELECTION STRATEGY FOR ${subject} (MANDATORY):
    - 90% of questions MUST come from the SUBJECT THEMES listed below.
    - Each question should map to a specific syllabus theme item.
    - The remaining 10% may come from adjacent foundational syllabus areas of the same subject.
    - Do NOT use recent events, current debates, or trending topics to choose questions.`;

  return `
UPSC CIVIL SERVICES PRELIMINARY EXAMINATION MCQ GENERATION TASK

GENERATE ${totalCount} UPSC STATIC-ONLY MCQ QUESTIONS

SUBJECT: ${subject.toUpperCase()}
${staticThemeContext}

${buildDifficultyDirective(difficulty)}

STATIC-ONLY MODE (HIGHEST PRIORITY):
- Generate ONLY pure-static questions.
- No current-affairs influence in topic selection, framing, wording, or explanation.
- Do NOT use recent or ongoing developments as the reason to choose a topic.
- Do NOT mention recent events, budgets, summits, policy announcements, current policy debates, or other news developments.
- Historical or long-settled judgments, schemes, missions, committees, and institutions are allowed when treated as static syllabus content.
- Do NOT use web search results, sources, URLs, or [Relevance: ...] tags.
- metadata.category MUST be "pure-static" for every question.
- metadata.derivedFromTopic MUST be omitted.

${PATTERN_ADHERENCE_2024}

STATIC QUESTION DESIGN GOALS:
- Use timeless, syllabus-grounded topics that remain high value for UPSC preparation.
- Favor conceptual understanding, careful elimination, and classic UPSC traps over news linkage.
- Use modern UPSC framing quality without introducing current-affairs topicality.

${UPSC_STEM_TEMPLATES}

${PYQ_EXAMPLES}

${subjectContext ? `
SUBJECT-SPECIFIC CONTEXT & KNOWLEDGE BASE:
${subjectContext}
` : ""
    }

${subjectTraps ? `
SUBJECT-SPECIFIC TRAP PATTERNS (Basic):
${subjectTraps}
` : ""
    }

${subjectAnalysis ? `
SUBJECT ANALYSIS (USE ONLY FOR STATIC PRIORITIZATION, NOT FOR CURRENT-AFFAIRS LINKAGE):
${subjectAnalysis}
` : ""
    }

${subjectThemes ? `
SUBJECT THEMES & PATTERNS (STATIC HIGH-PRIORITY TOPICS FOR QUESTION GENERATION):
${subjectThemes}
` : ""
    }

${subjectStrategicTraps ? `
STRATEGIC NOTES & TRAP CUES (USE THESE FOR DISTRACTOR DESIGN):
${subjectStrategicTraps}
` : ""
    }

${strategicSynthesis ? `
THEME USAGE GUIDANCE (Apply only as static syllabus guidance):
${strategicSynthesis}
` : ""
    }

${DISTRACTOR_BLUEPRINT}

${excludeTopics?.length ? buildExcludeTopicsSection(excludeTopics) : ""}

QUESTION STYLE DISTRIBUTION:
${styleInstructions}

CRITICAL QUALITY REQUIREMENTS (NON-NEGOTIABLE):

1. FACTUAL ACCURACY (MOST IMPORTANT):
- Every fact, date, number, name MUST be 100% accurate.
- Cross-reference with NCERT textbooks and standard references.
- If uncertain about a fact, DO NOT include it.
- Constitutional articles, amendment numbers, and treaty names must be exact.

2. SINGLE CORRECT ANSWER:
- There must be exactly ONE correct answer.
- The correct answer must be definitively correct.
- All distractors must be definitively incorrect.

3. ELIMINATION-PROOF DISTRACTORS:
- Do NOT use absolute words (only, always, never, all, none) in wrong options.
- Distractors should reflect plausible misconceptions from static syllabus study.

4. UPSC LANGUAGE STANDARDS:
- Use formal, precise language.
- Questions should feel like authentic UPSC Prelims questions.
- Keep framing timeless, not topical.

OUTPUT REQUIREMENTS:
- Generate exactly ${totalCount} questions.
- Each question must include: questionText, questionType, options, correctOption, explanation.
- questionType must be one of: standard, statement, match, assertion.
- options must have exactly four items labeled "A) ", "B) ", "C) ", "D) ".
- correctOption must be 0-3 (0=A, 1=B, 2=C, 3=D).
- Explanations must be educational but must NOT include [Relevance], Sources, or URLs.
- All questions MUST be CATEGORY 3: PURE STATIC.

questionType CLASSIFICATION RULE (CRITICAL):
- "standard": ONLY for direct one-line factual stems with NO numbered sub-items.
- "statement": ANY question containing numbered statements (1., 2., 3.) with
  "Which/How many of the above is/are correct?"
- "match": ANY question with "Match List-I with List-II" or "Consider the following pairs"
- "assertion": ANY question with "Statement-I / Statement-II" or "Assertion (A) / Reason (R)"

CRITICAL FINAL INSTRUCTION:
- Out of ${totalCount} questions, all ${totalCount} must be CATEGORY 3: PURE STATIC.
- CATEGORY 1: DIRECT CA = 0 questions.
- CATEGORY 2: DERIVED STATIC = 0 questions.
- CATEGORY 3: PURE STATIC = ${totalCount} questions.
- No current-affairs influence in topic selection, wording, or explanation.

NOW GENERATE ${totalCount} HIGH-QUALITY STATIC-ONLY UPSC MCQ QUESTIONS: `;
}


// ============================================================================
// CURRENT AFFAIRS INTEGRATION CONTEXT
// ============================================================================
const CURRENT_AFFAIRS_CONTEXT = `
CURRENT AFFAIRS GUIDELINES (TWO USAGE MODES):

IMPORTANT: Current affairs influence questions in TWO ways (ratios vary per subject):
1. DIRECT CA: Explicit mention of recent events with [Relevance] + Sources
2. DERIVED STATIC: Use CA to pick topic, but frame purely from textbooks (NO [Relevance])

You have access to Google Search for retrieving recent information.

FOR DIRECT CA QUESTIONS (per the subject-specific ratios specified above):

1. INTEGRATE RECENT EVENTS as TRIGGERS for static concepts:
   - "In context of India's recent diplomatic engagements in 2025..." → Test foreign policy concepts
   - "With reference to the Gaganyaan mission progress..." → Test space fundamentals
   - "Considering the Union Budget 2025-26..." → Test fiscal policy concepts

2. TIME FRAME for current affairs (STRICT):
   - Events from JANUARY 2025 TO PRESENT (Feb 2026)
   - Prefer 2025-2026 sources over older sources
   - Focus on the 18 months leading up to the May 2026 exam
   - Reference official sources (PIB, government websites, official reports) dated 2025+

3. QUESTION DESIGN with current affairs:
   - Current event as TRIGGER, static syllabus as ANSWER
   - Don't test obscure news details - test concepts triggered by news
   - These questions must add a [Relevance] note in explanation

4. HIGH-VALUE CURRENT AFFAIRS TOPICS (2025-2026 Focus):
   - International summits and India's role
   - New government schemes launched in 2025/2026
   - Recent Constitutional amendments and bills
   - Supreme Court judgments from 2025 onwards
   - Major scientific achievements and milestones
   - Recent environmental conventions (COP30 etc.)
   - Economic surveys and budget analyses of 2025-26

5. EXPLANATION FORMAT (for current-affairs questions ONLY):
   - RELEVANCE: How this relates to recent events (MUST BE 2025+)
   - STATIC LINK: The underlying concept from UPSC syllabus
   - Append: [Relevance: <event + month/year + source type>]
   - Include: Sources: https://pib.gov.in/... ; https://example.gov.in/...

MANDATORY WEB SEARCH (for Direct CA only):
- MUST use Google Search for the Direct CA questions
- Filter search results to prioritize 2025 and 2026 dates
- Each Direct CA question must cite at least one URL

FOR DERIVED STATIC QUESTIONS (per the subject-specific ratios specified above):
- Use web search to identify trending topics from past 12 months
- Examples: Governor-state conflicts, SEBI regulatory debates, Heatwave discussions
- Frame question purely from textbook/NCERT as if the topic is timeless
- NO mention of the triggering event in question text
- NO [Relevance] tag, NO Sources
- Student should NOT know this was CA-influenced

CRITICAL REMINDER (ratios vary per subject — see subject-specific ratios above):
- Direct CA (event visible, [Relevance] + Sources)
- Derived Static (event invisible, pure textbook framing)
- Pure Static (no CA influence)
`;

const CURRENT_AFFAIRS_THEME_CONTEXT = (theme: string) => `
CURRENT AFFAIRS FOCUS THEME: ${theme}

Generate questions specifically focusing on recent developments related to: "${theme}"

Use Google Search to find the latest information on this topic and create questions
that test understanding of underlying concepts through the lens of these recent events.
`;

// ============================================================================
// UPSC PRELIMS EXAM CONTEXT
// ============================================================================
// - 100 questions, 200 marks (2 marks per question)
// - Negative marking: 0.66 marks deducted per wrong answer (1/3rd of 2)
// - Duration: 2 hours
// - Cut-off typically ranges from 75-100 marks depending on difficulty
// - Questions are designed to be elimination-proof with sophisticated distractors

// ============================================================================
// UPSC STEM TEMPLATES (MUST FOLLOW VERBATIM PATTERNS)
// ============================================================================
const UPSC_STEM_TEMPLATES = `
MANDATORY UPSC PHRASING PATTERNS (Use these exact phrasings):

STATEMENT QUESTIONS:
- "Consider the following statements:"
- "Consider the following statements regarding [topic]:"
- "With reference to [topic], consider the following statements:"

PAIR/MATCH QUESTIONS:
- "Consider the following pairs:"
- "Match List-I with List-II and select the correct answer using the code given below:"

FACTUAL QUESTIONS:
- "Which of the following..."
- "Which one of the following..."
- "With reference to..., which of the following statements is/are correct?"

HOW MANY PATTERN (VERY IMPORTANT - HIGH FREQUENCY IN 2021-2024):
- "How many of the above statements is/are correct?"
- "How many of the above statements are correct?"
- "How many of the statements given above are correct?"
- "How many of the above pairs are correctly matched?"
- "How many of the pairs given above are correctly matched?"
- "How many pairs given above are correctly matched?"
- "How many pairs given above are not correctly matched?"
- "How many of the above is/are..."
- "In which of the above rows is the given information correctly matched?"

ANSWER CODE PHRASES:
- "Select the correct answer using the code given below:"
- "Which of the statements given above is/are correct?"
- "Which one of the following is correct in respect of the above statements?"
`;

// ============================================================================
// MISCONCEPTION-BASED DISTRACTOR BLUEPRINT
// ============================================================================
const DISTRACTOR_BLUEPRINT = `
DISTRACTOR DESIGN BLUEPRINT (MUST APPLY AT LEAST 2 PER QUESTION):

1. ADJACENT CONCEPT TRAP:
   Use a closely related but different concept
   Examples: CBDC vs cryptocurrency | Repo rate vs Bank rate | Tiger Reserve vs National Park
   
2. SCOPE TRAP:
   Correct principle but wrong scope/jurisdiction
   Examples: Union List vs State List | Legal tender vs universally accepted | Central vs State subject

3. EXCEPTION TRAP:
   Statement is broadly true but fails due to a known exception
   Examples: "All fundamental rights are available to citizens" (wrong - some to all persons)
   
4. TERMINOLOGY TRAP:
   Confusing similar-sounding terms
   Examples: Delimitation Commission vs Finance Commission | Sterilization vs OMO | Prorogation vs Dissolution

5. TIME/VERSION TRAP:
   Outdated fact vs latest update (perfect for current affairs integration)
   Examples: Old article numbers vs post-amendment | Previous committee vs current

6. AUTHORITY TRAP:
   Wrong institution/act/agency mapping
   Examples: ISRO vs DRDO vs DAE | FSSAI vs GEAC | RBI vs SEBI | Ministry mapping errors

7. GEOGRAPHY/ENDEMISM TRAP:
   Wrong habitat/region associations
   Examples: Species found in Madagascar vs Africa | Western Ghats endemic vs Himalayan

CRITICAL RULE: Wrong options must be *nearly defensible* to a half-prepared student, but falsifiable by one precise fact.
`;

// ============================================================================
// SUBJECT-WISE TRAP LIBRARY
// ============================================================================
const SUBJECT_TRAP_LIBRARY: Record<string, string> = {
  polity: `
POLITY TRAP PATTERNS (Apply at least one per question):
- Articles vs Parts vs Schedules confusion
- Committee nature: Statutory vs Constitutional vs Ad-hoc
- Lapse vs Prorogation vs Dissolution implications
- Subject in Union/State/Concurrent list mapping
- Constitutional amendment numbers and what they changed
- "Borrowed from" which constitution traps
- Governor's discretionary vs constitutional duties
- Money Bill vs Finance Bill vs Appropriation Bill
- CAG vs Comptroller distinction
- Lokpal vs Lokayukta jurisdiction`,

  economy: `
ECONOMY TRAP PATTERNS (Apply at least one per question):
- Instrument vs Market: Money market vs Capital market instruments
- RBI tools: OMO vs Sterilization vs LAF vs MSF
- Credit line vs Fixed loan subtle conditions
- Taxation authority: Central vs State vs Shared
- External vs Internal debt classifications
- WTO vs IMF vs World Bank function mapping
- Fiscal deficit vs Revenue deficit vs Primary deficit
- FDI vs FPI vs FII distinctions
- NBFC vs Bank regulatory differences
- Recent: PLI schemes, Production-linked distinctions`,

  environment: `
ENVIRONMENT TRAP PATTERNS (Apply at least one per question):
- Species distribution: Endemic vs Native vs Invasive
- Habitat mapping: Country ↔ Species natural habitat
- Taxonomy: Insect vs Bird vs Reptile classification
- Pollution sources: Primary vs Secondary pollutants
- Convention vs Agency mapping: CITES vs Ramsar vs CBD
- Biosphere reserves vs National Parks vs Wildlife Sanctuaries
- IUCN categories: Critically Endangered vs Vulnerable vs Near Threatened
- Coral reef vs Mangrove vs Wetland ecosystem confusions
- Western Ghats endemic species vs Eastern Himalayas
- Recent: Microplastics, GM regulations, Carbon markets`,

  science: `
SCIENCE & TECHNOLOGY TRAP PATTERNS (Apply at least one per question):
- Space agency programs: ISRO missions and their purposes
- Nuclear: Fission vs Fusion vs Decay mechanisms
- Recent tech: AI/ML, Quantum computing, Metaverse definitions
- Common misconceptions: Star lifecycle, planet classifications
- Agency mapping: ISRO vs DRDO vs DAE vs BARC
- Satellite types: GEO vs LEO vs MEO purposes
- Biotech: Gene editing vs GM vs traditional breeding
- Health: Disease mechanisms, vaccine types
- IT: Blockchain vs Crypto distinctions
- Defense: Indigenous vs Imported systems`,

  history: `
HISTORY TRAP PATTERNS (Apply at least one per question):
- Event chronology: Which came first
- Governor-General vs Viceroy period mapping
- Act provisions: Which act introduced what
- Freedom movement: Moderate vs Extremist vs Revolutionary
- Leader-movement association accuracy
- Battle-year-outcome combinations
- Reform movements: Social vs Religious vs Political
- Pre-independence parties and their founders
- Constitutional development: Acts from 1773 to 1947
- Regional movements and their leaders`,

  geography: `
GEOGRAPHY TRAP PATTERNS (Apply at least one per question):
- River origin/tributary mapping
- Pass-state-connection accuracy
- Soil type-region associations
- Monsoon mechanism details
- Mineral-state production mapping
- Climate zone classifications
- Agricultural patterns by region
- Industrial location factors
- Port-coast-state mapping
- Boundary-sharing countries`,

  art: `
ART & CULTURE TRAP PATTERNS (Apply at least one per question):
- Classical dance forms: Confusing similar mudras, origins, or patrons
- Folk dance ↔ State mapping: Wrong state associations (Bihu vs Bhangra states)
- Temple architecture: Nagara vs Dravida vs Vesara style features
- Painting schools: Mughal vs Rajput vs Pahari miniature confusion
- UNESCO sites: Wrong state/category (Cultural vs Natural vs Mixed)
- GI Tags: Product ↔ State/Region mapping
- Musical instruments: Classification (string/wind/percussion) and region
- Cave art: Ajanta vs Ellora vs Elephanta ↔ Religion/Dynasty associations
- Sangeet Natak Akademi: 8 classical dances recognition details
- Folk paintings: Madhubani vs Warli vs Pattachitra vs Gond regional origins
- Intangible Cultural Heritage: UNESCO-listed Indian traditions
- Ancient literature: Vedic vs Classical Sanskrit vs Prakrit texts
- Bhakti/Sufi saints: Region and philosophy confusion`,
};

// ============================================================================
// FEW-SHOT PYQ EXAMPLES BY STYLE
// ============================================================================
const PYQ_EXAMPLES = `
REAL UPSC PYQ EXAMPLES (USE AS STYLE REFERENCE ONLY - DO NOT COPY):

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

EXAMPLE 2 - STATEMENT-I/STATEMENT-II PATTERN (2024 Economy):
"Consider the following statements:
Statement-I: Syndicated lending spreads the risk of borrower default across multiple lenders.
Statement-II: The syndicated loan can be a fixed amount/lump sum of funds, but cannot be a credit line.

Which one of the following is correct in respect of the above statements?
(a) Both Statement-I and Statement-II are correct and Statement-II explains Statement-I.
(b) Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I.
(c) Statement-I is correct, but Statement-II is incorrect.
(d) Statement-I is incorrect, but Statement-II is correct."
Answer: (c) [Statement-I is true about risk spreading; Statement-II is false - syndicated loans CAN be credit lines]

EXAMPLE 3 - THREE-STATEMENT "HOW MANY" PATTERN (2024 Science):
"With reference to radioisotope thermoelectric generators (RTGs), consider the following statements:
1. RTGs are miniature fission reactors.
2. RTGs are used for powering the onboard systems of spacecrafts.
3. RTGs can use Plutonium-238, which is a by-product of weapons developments.

Which of the statements given above are correct?
(a) 1 and 2 only  (b) 2 and 3 only  (c) 1 and 3 only  (d) 1, 2 and 3"
Answer: (b) [Statement 1 is false - RTGs use decay not fission; 2 and 3 are correct]

EXAMPLE 4 - CLASSIFICATION FACTUAL PATTERN (2024 Environment):
"The organisms 'Cicada, Froghopper, and Pond skater' are:
(a) Birds  (b) Fish  (c) Insects  (d) Reptiles"
Answer: (c) [All three are insects - tests taxonomy knowledge]

EXAMPLE 5 - MATCH WITH "HOW MANY CORRECT" PATTERN (2024 Environment):
"Consider the following pairs:
Country - Animal found in its natural habitat
1. Brazil - Indri
2. Indonesia - Elk
3. Madagascar - Bonobo

How many of the pairs given above are correctly matched?
(a) Only one  (b) Only two  (c) All three  (d) None"
Answer: (d) [All wrong - Indri is Madagascar, Elk is N.America/Europe, Bonobo is Congo]

CRITICAL INSTRUCTION: Generate NEW questions inspired by these patterns. 
- Do NOT copy these questions
- Do NOT reuse the same entities/numbers/combinations
- Change at least 2 dimensions (entity + mechanism + option set)
`;

// ============================================================================
// YEAR-WEIGHTED STYLE TENDENCIES (Based on scraped PYQs in this repo)
// ============================================================================
const YEAR_TRENDS = `
UPSC YEAR-WISE PATTERN EVOLUTION (based on this repo's scraped PYQs):

2011-2013 ERA (FOUNDATION PERIOD):
- Direct factual questions dominated (~60%)
- Statement questions with 2-3 statements, "1 and 2 only" style options
- Simple "Which of the following is correct?" format
- Match-the-following with classic A-1, B-2, C-3, D-4 format
- Few application-based questions
- Questions directly from NCERT textbooks

Example patterns from 2011:
- "Under the constitution of India, which one of the following is not a fundamental duty?"
- "The authorization for withdrawal of funds from Consolidated Fund must come from:"
- "What is the difference between 'vote-on-account' and 'interim budget'?"

2014-2017 ERA (TRANSITION PERIOD):
- Increase in statement-based questions (~40-45%)
- Introduction of 4-5 statement questions
- "Select the correct answer using the code given below" became standard
- More conceptual questions testing understanding, not just facts
- Environment & Ecology questions increased significantly
- Current affairs integration began (schemes, policies, organizations)
- Extreme words used as traps: "only", "all", "always" in wrong statements

Example patterns from 2015-2017:
- "Consider the following statements... Which is/are correct?"
- "In the context of... which of the following is/are true?"
- Questions testing "NOT" - "Which is NOT a feature of..."
- Comparing two similar concepts (difference between X and Y)

2018-2020 ERA (SOPHISTICATION PERIOD):
- Statement questions dominated (~50-55%)
- Rise of application and conceptual questions
- More tricky distractors using scope/exception traps
- Science & Technology questions increased (space missions, biotech)
- Contemporary issues as triggers for static concept questions
- Questions testing nuanced understanding of constitutional provisions
- In this repo's scraped PYQs, the dominant templates are still classic code-based statement/pair questions
  ("Select the correct answer using the code given below" / "Which of the statements given above is/are correct")
  with little/no classic "Assertion (A)/Reason (R)" wording.

Example patterns from 2018-2020:
- "With reference to the Constitution of India, consider the following..."
- "If the President exercises power under Article 356, then..."
- Questions on committees, commissions with specific recommendations
- Testing exceptions to general rules

2021-2023 ERA (COMPLEXITY PEAK):
- In this repo's scraped PYQs: "How many" starts showing up clearly in 2022 (especially "How many pairs given above...")
  and spikes in 2023 ("How many of the above..." becomes very common).
- Statement-I/Statement-II questions appear prominently in 2023 onwards (modern Assertion-Reason logic with updated labels).
- Match/pairs with "How many pairs correctly matched?"
- Multiple dimensions tested in single question
- Distractors designed to defeat elimination strategies
- Focus on recent amendments, judgments, policies
- Questions linking static syllabus to current affairs context

Key shift: From "Which statements are correct?" to "How many are correct?"
- Forces knowledge of ALL statements, not just 2 to eliminate

Example patterns from 2021-2023:
- "How many of the above statements is/are correct? (a) Only one (b) Only two..."
- "How many of the above pairs are correctly matched?"
- Statement-I/Statement-II with causal relationship analysis
- 4-5 item classification questions ("How many are insects/birds/reptiles?")

2024-2025 ERA (CURRENT STANDARD):
- In this repo's scraped 2024 paper, templates are MIXED: classic statement-code questions still remain common alongside
  "How many" and Statement-I/Statement-II.
- Row-correctness tables ("In how many of the above rows..." and also "In which of the above rows...") appear in 2024.
- Specific emphasis on:
  * Constitutional amendments (recent: 101st-106th)
  * International organizations and India's role
  * Species habitat/country mapping (endemic species)
  * Party-leader/founder associations
  * Scheme-ministry-objective mapping
  * Scientific concepts with common misconceptions

2024 specific patterns observed:
- "How many Delimitation Commissions have been constituted?" (factual count)
- Party-Leader matching with "How many are correctly matched?"
- Country-Animal habitat pairs
- Statement-I/Statement-II on syndicated loans, CBDC, star lifecycle
- "The organisms Cicada, Froghopper, Pond skater are:" (classification)

2025 patterns (expected continuation):
- Maintain high "How many" density
- More interdisciplinary questions
- Avoid predictable answer distributions
- Test fine distinctions between related concepts

GENERATION STRATEGY BY QUESTION TYPE:

FOR STATEMENT QUESTIONS (60% of paper):
- Use "How many of the above is/are correct?" for 60% of statement questions
- Use classic "Which statements are correct?" for remaining 40%
- Mix 2-statement, 3-statement (most common), and 4-statement formats
- Ensure 1-2 statements are wrong with SUBTLE errors (not obvious)

FOR MATCH/PAIRS QUESTIONS:
- Prefer "How many pairs correctly matched?" over classic A-1, B-2 format
- Include at least one clearly wrong pair and one tricky pair
- Use confusable items (similar-sounding entities, related concepts)

FOR STATEMENT-I/STATEMENT-II:
- Use for analytical questions in Economy, Environment, Science
- Test causal relationships: "Does Statement-II explain Statement-I?"
- Avoid simple "both true/both false" - make relationship the challenge

FOR FACTUAL QUESTIONS:
- Use for testing specific counts, dates, names, classifications
- Frame as "Which of the following..." or "Which one of the following..."
- Include plausible but incorrect options based on common misconceptions
`;

// ============================================================================
// CURRENT ERA GENERATION INSTRUCTIONS (2024-2025 Patterns)
// ============================================================================
const CURRENT_ERA_INSTRUCTION = `
ERA: CURRENT (2024-2025 STANDARD)

Generate questions matching the LATEST UPSC patterns (2024-2025):

KEY INSIGHT: Statement-based MCQs dominate (~60%). While "How many correct?" format
is common, actual 2024 PYQs show significant VARIETY in formats. Do NOT over-rely
on "How many" - mix formats for authentic practice.

MANDATORY FORMAT DISTRIBUTION (for balanced, authentic practice):
- "How many of the above" format: ~30-35% (NOT more than 40%!)
- Classic "Which is/are correct" with codes: ~25-30%
- Statement-I/Statement-II (Assertion-Reason logic): ~12-15%
- Match the following (classic or "how many pairs"): ~10-12%
- Direct factual/Classification: ~15-20%

IMPORTANT: Do NOT make more than 40% of questions use "How many" format!
Mix formats to test different analytical skills.

PRIMARY FORMATS:
1. "HOW MANY" / COUNTING (~30-35% max):
   - Statements: "How many of the above statements are correct?"
   - Pairs: "How many of the pairs given above are correctly matched?"
   - Rows: "In how many of the above rows is the given information correctly matched?"
   - Also seen: "In which of the above rows is the given information correctly matched?"

2. CLASSIC STATEMENT-CODE FORMAT (~25-30%):
   "Consider the following statements:
   1. [Statement]
   2. [Statement]
   3. [Statement]
   Which of the statements given above is/are correct?"
   Options: (a) 1 only (b) 1 and 2 only (c) 2 and 3 only (d) 1, 2 and 3

3. STATEMENT-I/STATEMENT-II (~12-15%):
   Modern label for Assertion-Reason logic - tests causal/explanatory relationships
   Also possible: Statement-I + Statement-II + Statement-III explanation template

4. THREE-COLUMN MATCH / ROW-CORRECTNESS (~5%):
   Tables with 3+ columns, evaluate row-by-row correctness (new 2024 pattern)

5. CLASSIC MATCH THE FOLLOWING (~8-10%):
   "Match List-I with List-II" - also in "How many pairs" format

6. STANDALONE/DIRECT (~15-20%):
   Testing precise knowledge with sophisticated distractors
   - Party-Leader/Founder associations
   - Country-Species habitat mapping
   - Organisms classification (taxonomy traps)

Follow 2024-2025 patterns as the PRIMARY reference. Ensure format VARIETY.
`;

// ============================================================================
// 2026 PRELIMS FOCUS - CRITICAL STRATEGIC GUIDANCE
// ============================================================================
const PRELIMS_2026_FOCUS = `
CRITICAL: 2026 PRELIMS FOCUS

YOUR GOAL: Generate questions that would likely appear in UPSC PRELIMS 2026.

IMPORTANT DISTINCTION:
- The theme data provided comes from analyzing 2013-2025 PYQs
- BUT you are NOT trying to recreate old PYQ patterns
- Use theme data for TOPIC COVERAGE, apply ONLY 2024-2025 FRAMING

WHAT THIS MEANS:
✗ DO NOT: Generate deep/specific questions in the style of 2013-2017
- DO: Take topics from themes but frame them with 2024-2025 sophistication
✗ DO NOT: Focus on outdated schemes, ended programs, or historical minutiae
- DO: Focus on currently relevant provisions, active policies, recent developments

UPSC EVOLUTION INSIGHT:
- Static content has REDUCED by ~50% compared to 2013-2017 era
- Questions now test UNDERSTANDING + APPLICATION, not just RECALL
- Cross-subject integration has INCREASED significantly
- Current affairs TRIGGERS static concepts (not standalone static)
`;

function getContentBalanceRatio(subject: string): string {
  const { directCA, derivedStatic } = getSubjectCARatio(subject);
  const dcPct = Math.round(directCA * 100);
  const dsPct = Math.round(derivedStatic * 100);
  const psPct = 100 - dcPct - dsPct; // ensure they sum to 100

  return `
CONTENT BALANCE: THREE-TIER SYSTEM (CALIBRATED PER SUBJECT FROM PYQ ANALYSIS 2013-2025)

${dcPct}% DIRECT CA + ${dsPct}% DERIVED STATIC + ${psPct}% PURE STATIC (for ${subject})

1. DIRECT CA (${dcPct}%):
   - Explicit mention of recent events (2025-2026)
   - MUST include [Relevance: ...] and Sources in explanation
   - Example: "With reference to India's inclusion in the JP Morgan Bond Index in 2025..."

2. DERIVED STATIC (${dsPct}%):
   - Topic selected because it's trending in news, but question is pure textbook
   - NO mention of recent events, NO [Relevance], NO Sources
   - The CA influence is invisible to the student
   - Example: News about SEBI F&O warnings → Question: "Which of the following statements
     about derivatives is correct? 1. Options give the right but not obligation..."
     (No mention of SEBI or recent warnings)

3. PURE STATIC (${psPct}%):
   - Traditional syllabus topics regardless of news cycle
   - Core Geography, History, foundational Polity/Economy concepts
   - Example: "Consider the following rivers: 1. Chambal is a tributary of Yamuna..."

CRITICAL EXAMPLES SHOWING THE DIFFERENCE:

PURE STATIC (${psPct}% category):
"Consider the following statements regarding Article 356:
1. It can be imposed only on the recommendation of the Governor.
2. A proclamation must be approved by both Houses of Parliament.
Which of the statements given above is/are correct?"
[No CA influence - core constitutional topic]

DERIVED STATIC (${dsPct}% category):
"Consider the following statements regarding the Governor's powers:
1. The Governor can reserve a bill for the President's consideration.
2. There is a time limit within which the Governor must give assent to a bill.
Which of the statements given above is/are correct?"
[Same topic as above, but selected BECAUSE of recent Governor-state conflicts in news.
Question itself has NO mention of these conflicts - appears identical to pure static]

DIRECT CA (${dcPct}% category):
"In the context of recent debates on the role of Governors in state legislation in 2025,
consider the following statements regarding Article 200:
1. The Governor can withhold assent to a bill indefinitely.
2. If the Governor reserves a bill for the President, the state legislature cannot override it.
Which of the statements given above is/are correct?"
[Explicitly mentions recent events, explanation will have [Relevance: Governor-state conflicts in
Tamil Nadu/Kerala, 2025] and Sources: https://thehindu.com/...]
`;
}

const RELEVANCE_FILTER = `
RELEVANCE FILTER FOR 2026 PRELIMS

AVOID generating questions on:
- Schemes that have ENDED or MERGED (unless historically tested)
- Topics with DECLINING frequency in 2021-2024 PYQs
- Very deep static minutiae that UPSC has moved away from
- Specific dates/numbers unless absolutely fundamental
- Regional details that are too narrow in scope

PRIORITIZE generating questions on:
- Topics with INCREASING frequency in 2021-2024 (see trends)
- Cross-linkage questions (Environment + Economy, Polity + Current Affairs)
- Constitutional provisions with RECENT amendments or interpretations
- International agreements/frameworks India has engaged with recently
- Application-based understanding over pure recall
- Governance reforms, new institutional mechanisms
- Climate, biodiversity, and sustainability themes (rising trend)

TOPIC RELEVANCE HEURISTIC:
If a topic was asked 3+ times in 2013-2017 but ZERO times in 2021-2024,
it's likely DEPRIORITIZED by UPSC. Don't focus on it.
`;

const PATTERN_ADHERENCE_2024 = `
STRICT 2024/2025 PATTERN ADHERENCE

Your FRAMING STYLE, TRAPPING LOGIC, and DISTRACTOR DESIGN must mirror 2024/2025 PYQs.

Even if theme files mention older patterns or topics, IGNORE outdated patterns.
Apply 2024/2025 framing to ALL topics.

2024/2025 SIGNATURE PATTERNS TO USE:

1. STATEMENT-I/STATEMENT-II with EXPLANATION LOGIC:
   - Tests causal/explanatory relationships
   - "Does Statement-II explain Statement-I?"
   - Both statements can be true but NOT explanatory

2. "HOW MANY CORRECT" with ALL STATEMENTS VERIFIABLE:
   - Each statement must be independently checkable
   - Mix of correct and incorrect (not all true/all false)

3. THREE-COLUMN ROW CORRECTNESS (2024 innovation):
   - Tables with 3+ columns
   - Evaluate row-by-row correctness
   - "In how many rows is the information correctly matched?"

4. ASSOCIATION TRAPS (Party-Leader, Species-Habitat):
   - Pairs matching format
   - Tests precise knowledge, not vague associations
   - Common in Polity, Environment, History

5. CONTEMPORARY HOOKS:
   - Reference recent events as question context
   - Link static to current (G20, climate summits, recent judgments)
`;

const STYLE_INSTRUCTIONS: Record<QuestionStyle, string> = {
  factual: `
QUESTION STYLE: STANDARD / FACTUAL MCQ

Format: Direct question with 4 options (A, B, C, D)
questionType: "standard"

THIS IS THE SIMPLEST QUESTION FORMAT. A single direct question stem, NO numbered sub-items.

NEVER USE these patterns for standard/factual questions (they belong to OTHER questionTypes):
✗ "Consider the following statements: 1. ... 2. ..."  → This is questionType "statement"
✗ "How many of the above statements is/are correct?"  → This is questionType "statement"
✗ "Which of the statements given above is/are correct?" → This is questionType "statement"
✗ "Consider the following pairs: ..."  → This is questionType "match"
✗ "Match List-I with List-II"  → This is questionType "match"
✗ "Statement-I: ... Statement-II: ..."  → This is questionType "assertion"
If you catch yourself writing numbered statements (1., 2., 3.), STOP — that is NOT a standard question.

CORRECT patterns for standard/factual questions:
✓ "Which of the following..." with 4 direct answer options
✓ "Which one of the following..."
✓ "The [entity] was..." (fill-in-the-blank style)
✓ "Who among the following..."
✓ "What is the correct sequence of..."
✓ Direct one-line factual stems

UPSC Pattern Guidelines:
- Question should test specific knowledge or understanding
- Frame questions as "Which of the following...", "What/Who/Where...", or direct questions
- Favor direct one-line factual stems like the 2024/2025 paper examples
- All four options must be grammatically consistent with the question stem
- Correct answer must be definitively correct, not "most correct"

Examples (2024/2025 direct factual):
- "The irrigation device called 'Araghatta' was"
- "The longest border between any two countries in the world is between"
- "The first Gandharva Mahavidyalaya, a music training school, was set up in 1901 by Vishnu Digambar Paluskar in"
- "Which of the following is NOT a feature borrowed from the British Constitution?"

Distractor Design (CRITICAL):
- DO NOT use absolute words like "only", "always", "never", "all", "none" in wrong options
- Each distractor should be a plausible misconception or commonly confused fact
- Distractors should test genuine knowledge gaps, not trick through wordplay
- Include distractors that would trap someone who studied superficially`,

  conceptual: `
QUESTION STYLE: CONCEPTUAL / APPLICATION MCQ

Format: Scenario - based or concept - testing question with 4 options
questionType: "standard"

UPSC Pattern Guidelines:
- Tests understanding of WHY, not just WHAT
  - May present a scenario and ask for correct interpretation
    - Tests ability to apply constitutional / legal / economic principles
      - Often connects theoretical knowledge to real - world application

Question Framing:
- "In the context of..., which statement is correct?"
  - "Which of the following best explains...?"
  - "The primary objective of [policy/provision] is:"
  - Present a situation and ask what provision / article applies

Distractor Design:
- Include options that would be correct in a different context
  - Use commonly held misconceptions as distractors
    - Test understanding of scope and limitations of concepts
      - Include options that mix up similar - sounding provisions`,

  statement: `
QUESTION STYLE: STATEMENT - BASED(56 % OF UPSC PAPER - MOST IMPORTANT!)

Format: Multiple statements to evaluate for correctness
questionType: "statement"

Examples (statement format):
- "Consider the following statements: ... Which of the statements given above is/are correct?"
- "How many of the above statements is/are correct?"

UPSC 2024 - 2025 Distribution(follow this):
- Two - statement questions: ~15 per paper
- Three - statement questions: ~39 per paper(MOST COMMON)
- Four - statement questions: ~9 per paper
- Five + statement questions: ~4 per paper

"HOW MANY" FORMAT(~30 - 35 % of statement questions - NOT dominant):

THREE - STATEMENT "HOW MANY" FORMAT(PREFERRED):
"Consider the following statements regarding [topic]:
1.[Statement 1]
2.[Statement 2]
3.[Statement 3]

How many of the above statements is / are correct ? "

Options MUST be EXACTLY:
A) Only one
B) Only two
C) All three
D) None

FOUR - STATEMENT "HOW MANY" FORMAT:
"Consider the following statements:
1.[Statement 1]
2.[Statement 2]
3.[Statement 3]
4.[Statement 4]

How many of the above statements is / are correct ? "

Options MUST be EXACTLY:
A) Only one
B) Only two
C) Only three
D) All four

CLASSIC "WHICH STATEMENTS" FORMAT(~50 - 60 % of statement questions - PRIMARY):

"Consider the following statements regarding [topic]:
1.[Statement 1]
2.[Statement 2]
3.[Statement 3]

Which of the statements given above is / are correct ? "

Options format:
A) 1 only
B) 1 and 2 only
C) 2 and 3 only
D) 1, 2 and 3

TWO - STATEMENT SIMPLE FORMAT:
"Consider the following statements:
1.[Statement 1]
2.[Statement 2]

Which of the statements given above is / are correct ? "

Options MUST be:
A) 1 only
B) 2 only
C) Both 1 and 2
D) Neither 1 nor 2

CRITICAL RULES FOR STATEMENT QUESTIONS:
1. Each statement must be independently verifiable as true or false
2. Statements should be related to the same topic but test different aspects
3. AVOID making all statements true or all false(makes question too easy)
4. Ideal distribution: 1 - 2 statements correct, 1 - 2 incorrect(requires careful analysis)
5. Wrong statements should contain SUBTLE errors using trap patterns:
   - Scope trap: Correct concept, wrong jurisdiction / scope
  - Exception trap: Generally true but fails due to known exception
    - Terminology trap: Confuses similar - sounding terms / provisions
      - Time trap: Outdated information presented as current
6. Use specific facts(years, numbers, names) in some statements to test precision
7. Test common misconceptions from the Subject Trap Library in incorrect statements
8. Ensure answer distribution is varied across a batch(not all "Only two")`,

  match: `
QUESTION STYLE: MATCH THE FOLLOWING / PAIRS(~8 - 12 questions per UPSC paper)

questionType: "match"

FORMAT 1: "HOW MANY PAIRS CORRECTLY MATCHED"(DOMINANT IN 2021 - 2024):

"Consider the following pairs:

[Category A][Category B]
1.[Item 1]-[Description 1]
2.[Item 2]-[Description 2]
3.[Item 3]-[Description 3]
4.[Item 4]-[Description 4]

How many of the above pairs are correctly matched ? "

Options MUST be EXACTLY:
A) Only one pair
B) Only two pairs
C) Only three pairs
D) All four pairs

  (Can also be 3 pairs with options: Only one / Only two / All three / None)

REAL PYQ EXAMPLE(2024 Polity - Party / Leader):
"Consider the following pairs:
Party - Its Leader
1. Bhartiya Jana Sangh - Dr.Shyama Prasad Mukherjee
2. Socialist Party - C.Rajagopalachari
3. Congress for Democracy - Jagjivan Ram
4. Swatantra Party - Acharya Narendra Dev

How many of the above are correctly matched ? "
Answer: Only two(Pairs 1 and 3 correct)

REAL PYQ EXAMPLE(2024 Environment - Country / Animal):
"Consider the following pairs:
Country - Animal found in its natural habitat
1. Brazil - Indri
2. Indonesia - Elk
3. Madagascar - Bonobo

How many of the pairs given above are correctly matched ? "
Answer: None(All wrong - tests precise habitat knowledge)

FORMAT 2: CLASSIC MATCH LIST - I WITH LIST - II:

"Match List-I with List-II and select the correct answer using the code given below:

List - I(Item)          List - II(Description)
A. [Item 1]1.[Description 1]
B. [Item 2]2.[Description 2]
C. [Item 3]3.[Description 3]
D. [Item 4]4.[Description 4]

Select the correct answer using the code given below: "

Options format:
       A   B   C   D
  (a)  1   2   3   4
  (b)  2   1   4   3
  (c)  3   4   1   2
  (d)  4   3   2   1

DESIGN RULES(CRITICAL FOR UPSC - QUALITY):
1. Items in List - I MUST be same category(all rivers, all acts, all treaties, etc.)
2. Descriptions in List - II MUST be parallel(all states, all years, all features, etc.)
3. Include at least 2 items that could PLAUSIBLY match with same description(creates difficulty)
4. Commonly confused pairs should be included to test precise knowledge
5. Ensure ONLY ONE correct matching combination exists
6. For "How many pairs" format: Mix correct and incorrect pairs(ideal: 1 - 2 correct, 2 - 3 wrong)

COMMON UPSC MATCH THEMES:
- Parties ↔ Founders / Leaders(very common in 2024)
- Country ↔ Endemic / Native species(very common in Environment)
- Treaties / Agreements ↔ Years / Countries
- Constitutional Articles ↔ Provisions / Subjects
- Rivers ↔ Origins / Tributaries / States
- National Parks / Reserves ↔ States / Flagship Species
- Government Schemes ↔ Objectives / Ministries
- International Organizations ↔ Headquarters / Functions
- Historical Events ↔ Years / Leaders
- Folk Arts / Dances ↔ States / Regions
- Minerals ↔ States(leading producers)`,

  assertion: `
QUESTION STYLE: STATEMENT - I / STATEMENT - II(and STATEMENT - I / II / III) - UPSC CURRENT FORMAT

Format: 2 or 3 statements with logical relationship analysis
questionType: "assertion"

NOTE: UPSC 2024 predominantly uses "Statement-I/Statement-II" format instead of 
traditional "Assertion (A)/Reason (R)" format.USE THIS FORMAT:

EXACT FORMAT A(2 - STATEMENT)(MUST USE WORDING):
"Consider the following statements:

Statement - I: [Statement of fact, claim, or observation]

Statement - II: [Related statement - could be explanation, cause, or independent fact]

Which one of the following is correct in respect of the above statements ? "

OPTIONS MUST BE EXACTLY(USE THIS EXACT WORDING):
A) Both Statement - I and Statement - II are correct and Statement - II is the correct explanation for Statement - I
B) Both Statement - I and Statement - II are correct and Statement - II is not the correct explanation for Statement - I
C) Statement - I is correct but Statement - II is incorrect
D) Statement - I is incorrect but Statement - II is correct

EXACT FORMAT B(3 - STATEMENT EXPLANATION)(MUST USE WORDING):
"Consider the following statements:

Statement - I: [Claim / observation]

Statement - II: [Potential explanation 1]

Statement - III: [Potential explanation 2]

Which one of the following is correct in respect of the above statements ? "

OPTIONS MUST BE EXACTLY(USE THIS EXACT WORDING):
A) Both Statement - II and Statement - III are correct and both of them explain Statement - I
B) Both Statement - II and Statement - III are correct but only one of them explains Statement - I
C) Only one of the Statements II and III is correct and that explains Statement - I
D) Neither Statement - II nor Statement - III is correct

CRITICAL DESIGN RULES:
1. Statement - I must be a clear, verifiable statement of fact or claim
2. Statement - II(and Statement - III, if used) must be independently verifiable as true or false
3. The relationship between Statement - I and the explanation statement(s) is what makes this question hard
4. Most challenging: explanation statement(s) are true but NOT the correct explanation(tests reasoning)
5. If an option says "explains Statement-I", the explanation statement(s) MUST be independently true
6. If an option says "explains Statement-I", it MUST be a DIRECT causal / explanatory bridge, not merely correlated

AVOID "DEFINITION EXPLAINS DEFINITION"(TOO EASY)
PREFER: "principle → implication"(Economy) or "mechanism → outcome"(Environment / Science)

COMMON TRAPS TO CREATE:
- Statement - II is a true statement but explains something else, not Statement - I
- Statement - II partially explains Statement - I but misses the main reason
- Statement - I and Statement - II are both true and seem related but causation is reversed
- Statement - II is the effect, not the cause of Statement - I

REAL PYQ EXAMPLE(2024 Economy):
"Consider the following statements:
Statement - I: Syndicated lending spreads the risk of borrower default across multiple lenders.
Statement - II: The syndicated loan can be a fixed amount / lump sum of funds, but cannot be a credit line.

Which one of the following is correct in respect of the above statements ? "

Answer: (c) Statement - I is correct but Statement - II is incorrect
[Statement - I is true; Statement - II is false because syndicated loans CAN be credit lines]`,
};

// ============================================================================
// SUBJECT-SPECIFIC KNOWLEDGE BASES
// ============================================================================

const SUBJECT_CONTEXTS: Record<string, string> = {
  polity: `
INDIAN POLITY & GOVERNANCE(15 - 20 % of UPSC Prelims, ~15 - 20 questions)

PRIMARY SOURCES(align questions with these):
- M.Laxmikanth's "Indian Polity" - THE standard reference
- NCERT Political Science(Class 11 - 12)
- Constitution of India(original text)
- Recent Supreme Court judgments

HIGH - WEIGHTAGE TOPICS:
1. Constitutional Framework: Preamble, Fundamental Rights(Art 12 - 35), DPSPs(Art 36 - 51), Fundamental Duties(Art 51A)
2. Union Executive: President(Art 52 - 62), Vice President, PM & Council of Ministers, Attorney General
3. Parliament: Lok Sabha, Rajya Sabha, Legislative procedures, Money Bill vs Finance Bill, Parliamentary privileges
4. Judiciary: Supreme Court(Art 124 - 147), High Courts, Judicial Review, PIL, Basic Structure Doctrine
5. State Government: Governor(Art 153 - 167), CM & State Council, State Legislature
6. Local Government: 73rd Amendment(Panchayats), 74th Amendment(Municipalities), PESA Act
7. Constitutional Bodies: Election Commission, CAG, UPSC, Finance Commission, NCSC / NCST
8. Emergency Provisions: National(Art 352), State(Art 356), Financial(Art 360)
9. Amendment Procedure: Art 368, types of amendments, ratification requirements
10. Recent Amendments: 101st(GST), 102nd(NCBC), 103rd(EWS quota), 104th(SC / ST reservation), 105th(OBC enumeration), 106th(Women's reservation)

COMMON UPSC TRAPS IN POLITY:
- Confusing similar articles(Art 14 vs 15 vs 16)
- President's discretionary vs constitutional powers
- Difference between Ordinance - making powers(Art 123 vs 213)
- Money Bill vs Financial Bill misconceptions
- Governor's discretionary powers misconceptions
- Difference between Constitutional and Statutory bodies`,

  history: `
INDIAN HISTORY(10 - 18 % of UPSC Prelims, ~10 - 18 questions)

PRIMARY SOURCES:
- NCERT History books(Class 6 - 12) - FOUNDATION
- Spectrum's "A Brief History of Modern India" - Modern History
- RS Sharma - Ancient India
- Satish Chandra - Medieval India
- Bipin Chandra - India's Struggle for Independence

ANCIENT HISTORY FOCUS AREAS:
1. Indus Valley Civilization: Sites, features, decline theories, script
2. Vedic Period: Rig Vedic vs Later Vedic, society, economy
3. Buddhism & Jainism: Teachings, councils, spread, decline
4. Mauryan Empire: Chandragupta, Ashoka, administration, Dhamma
5. Post - Mauryan: Kushanas, Satavahanas, Sangam literature
6. Gupta Period: Golden age, art, science, administration
7. Regional Kingdoms: Cholas, Pallavas, Chalukyas, Rashtrakutas

MEDIEVAL HISTORY FOCUS AREAS:
1. Delhi Sultanate: Dynasties, administration, architecture
2. Vijayanagara & Bahmani kingdoms
3. Mughal Empire: Administration, Mansabdari, art, religious policies
4. Bhakti & Sufi movements
5. Regional powers: Marathas, Sikhs, Rajputs

MODERN HISTORY(HIGHEST WEIGHTAGE):
1. British Expansion: Battles, policies, economic drain
2. Socio - Religious Reforms: Brahmo Samaj, Arya Samaj, others
3. 1857 Revolt: Causes, events, aftermath
4. Indian National Movement phases
5. Gandhi Era: Movements, strategies, timeline
6. Revolutionary Movement: HSRA, Anushilan, Ghadar
7. Constitutional Development: Acts of 1909, 1919, 1935
8. Independence & Partition

COMMON TRAPS:
- Confusing years of events(very specific dates asked)
- Mixing up reform movements and their founders
- Timeline errors in freedom movement
- Confusing British Acts and their provisions`,

  geography: `
INDIAN & WORLD GEOGRAPHY(12 - 18 % of UPSC Prelims, ~12 - 18 questions)

PRIMARY SOURCES:
- NCERT Geography(Class 6 - 12) - FOUNDATION
- G.C.Leong's "Certificate Physical and Human Geography"
- Oxford School Atlas
- Khullar's "India: A Comprehensive Geography"

PHYSICAL GEOGRAPHY:
1. Geomorphology: Landforms, plate tectonics, volcanism, earthquakes
2. Climatology: Atmospheric circulation, monsoons, climate types
3. Oceanography: Currents, tides, marine resources
4. Biogeography: Biomes, soils, vegetation types

INDIAN GEOGRAPHY(HIGH WEIGHTAGE):
1. Physical Features: Himalayas, Northern Plains, Peninsular Plateau, Coastal Plains, Islands
2. Drainage: River systems(Himalayan vs Peninsular), interlinking projects
3. Climate: Monsoon mechanism, seasons, rainfall distribution
4. Natural Vegetation: Forest types, biosphere reserves
5. Agriculture: Cropping patterns, irrigation, Green / White / Blue revolutions
6. Minerals & Energy: Distribution, reserves, policies
7. Industries: Location factors, industrial regions, policies
8. Transport: Roadways, railways, waterways, airways

WORLD GEOGRAPHY:
1. Continents and major features
2. Important straits, channels, passes
3. Climate regions and their characteristics
4. Major agricultural regions
5. Geopolitically significant locations

COMMON TRAPS:
- Confusing tributaries of rivers(left bank vs right bank)
- Mixing up national parks and their locations / species
- Wrong associations of crops with soil types
- Confusing similar - sounding geographical features`,

  economy: `
INDIAN ECONOMY(10 - 15 % of UPSC Prelims, ~10 - 15 questions)

PRIMARY SOURCES:
- NCERT Economics(Class 11 - 12)
- Ramesh Singh's "Indian Economy"
- Economic Survey(latest)
- Union Budget documents

MACROECONOMICS:
1. National Income: GDP, GNP, NDP, NNP concepts and calculation
2. Inflation: Types, measurement(CPI, WPI), causes, control
3. Monetary Policy: RBI tools(Repo, Reverse Repo, CRR, SLR, OMO)
4. Fiscal Policy: Budget components, deficits, FRBM Act
5. Balance of Payments: Current account, Capital account, forex reserves

BANKING & FINANCE:
1. Banking Structure: RBI, Commercial Banks, Payment Banks, SFBs
2. Financial Markets: Money market, capital market instruments
3. Financial Inclusion: Jan Dhan, MUDRA, Stand - Up India
4. Insurance & Pension: IRDAI, PFRDA, schemes

SECTORS:
1. Agriculture: MSP, procurement, subsidies, reforms
2. Industry: Make in India, PLI schemes, Industrial policies
3. Services: IT, telecom, tourism contributions

GOVERNMENT INITIATIVES:
1. Taxation: GST structure, Direct Tax Code
2. Social Sector: MGNREGA, PDS, food security
3. Infrastructure: Gati Shakti, Sagarmala, Bharatmala
4. Digital: UPI, ONDC, Digital India

INTERNATIONAL:
1. Trade: WTO, FTAs, trade balance
2. International Organizations: IMF, World Bank, ADB, NDB, AIIB
3. Global indices: HDI, GHI, Ease of Doing Business

COMMON TRAPS:
- Confusing monetary policy tools and their effects
- Mixing up different types of deficits
- Wrong associations of schemes with ministries
- Confusing similar - sounding financial instruments`,

  environment: `
ENVIRONMENT & ECOLOGY(15 - 20 % of UPSC Prelims, ~15 - 20 questions)

PRIMARY SOURCES:
- NCERT Biology(Ecology chapters)
- Shankar IAS Environment book
- ENVIS portals
- MoEFCC reports

ECOLOGY CONCEPTS:
1. Ecosystem: Structure, function, energy flow, nutrient cycling
2. Biodiversity: Levels, hotspots, threats, conservation
3. Ecological Succession: Primary, secondary, climax community
4. Biomes: Terrestrial and aquatic ecosystems
5. Food chains, food webs, ecological pyramids

BIODIVERSITY & CONSERVATION:
1. Protected Areas: Categories(National Parks, Sanctuaries, Biosphere Reserves, Tiger Reserves)
2. Conservation approaches: In - situ vs Ex - situ
3. IUCN Red List categories
4. Wildlife Protection Act 1972(Schedules)
5. Biodiversity Act 2002
6. Important species: Endemic, endangered, flagship, keystone

ENVIRONMENTAL ISSUES:
1. Pollution: Air(sources, standards), Water, Soil, Noise
2. Climate Change: Greenhouse effect, global warming, impacts
3. Waste Management: Solid waste, e - waste, plastic waste rules
4. Desertification, land degradation

INTERNATIONAL CONVENTIONS:
1. UNFCCC: COPs, Paris Agreement, NDCs
2. CBD: Aichi targets, Kunming - Montreal framework
3. CITES: Appendices, wildlife trade
4. Ramsar: Wetlands, Indian sites
5. Montreal Protocol: Ozone, Kigali Amendment
6. Basel, Rotterdam, Stockholm: Hazardous substances

INDIAN INITIATIVES:
1. National Action Plan on Climate Change: 8 missions
2. CAMPA, Green India Mission
3. National Biodiversity Authority
4. Compensatory Afforestation

COMMON TRAPS:
- Confusing different protected area categories
- Mixing up international conventions and their focus
- Wrong locations of national parks / tiger reserves
- Confusing endemic species locations`,

  science: `
SCIENCE & TECHNOLOGY(5 - 15 % of UPSC Prelims, ~5 - 15 questions)

PRIMARY SOURCES:
- NCERT Science books(Class 6 - 10)
- NCERT Physics, Chemistry, Biology(Class 11 - 12 basics)
- Science Reporter magazine
- PIB releases on S & T

PHYSICS & SPACE:
1. Basic concepts: Motion, energy, waves, optics
2. Nuclear science: Fission, fusion, reactors
3. Space technology: ISRO missions, satellites, launch vehicles
4. Defense technology: Missiles, radar, indigenous development

CHEMISTRY:
1. Basic concepts: Atoms, molecules, reactions
2. Materials: Polymers, alloys, nanomaterials
3. Chemical industries: Fertilizers, petrochemicals

BIOLOGY & HEALTH:
1. Cell biology basics
2. Genetics: DNA, genes, genetic engineering, GMOs
3. Diseases: Communicable, non - communicable, epidemics
4. Biotechnology: Applications, ethics, regulations
5. Human body systems basics

CURRENT S & T DEVELOPMENTS:
1. AI & Machine Learning
2. Quantum computing
3. 5G / 6G technology
4. Blockchain
5. Renewable energy tech
6. Space missions(global)
7. Medical breakthroughs

GOVERNMENT INITIATIVES:
1. ISRO programs: Chandrayaan, Gaganyaan, etc.
2. DRDO projects
3. DAE: Nuclear power program
4. DST: Various schemes
5. Make in India in defense

COMMON TRAPS:
- Confusing similar - sounding technologies
- Wrong agency associations(ISRO vs DRDO vs DAE)
- Outdated information on recent missions
- Mixing up satellite types and purposes`,

  "current affairs": `
CURRENT AFFAIRS(30 - 40 % of UPSC Prelims directly / indirectly)

INTEGRATION APPROACH:
- Current affairs are NOT a separate subject
- UPSC tests static concepts THROUGH current events
- ~70 % of current affairs questions need static knowledge to answer

KEY DOMAINS:
1. Government Schemes & Policies(link to Polity / Economy)
2. International Relations & Summits
3. Awards & Recognition(link to relevant fields)
4. Environmental developments(link to Environment)
5. Science & Technology breakthroughs
6. Economic data & reports
7. Constitutional & Legal developments

TIME FRAME:
- Focus on 18 - 24 months before exam
- Some questions test events from 2 + years ago
- Anniversary years(25th, 50th, 75th, 100th) are important

SOURCES TO ALIGN WITH:
- The Hindu / Indian Express editorials
- PIB(Press Information Bureau)
- Yojana & Kurukshetra magazines
- Economic Survey
- India Year Book

INTEGRATION EXAMPLES:
- G20 Summit → Link to economic organizations, India's foreign policy
- New environmental policy → Link to international conventions, constitutional provisions
- Supreme Court judgment → Link to relevant constitutional articles
- New government scheme → Link to ministry, budget allocation, related acts`,

  "art and culture": `
ART & CULTURE(5 - 10 % of UPSC Prelims, ~5 - 10 questions)

PRIMARY SOURCES:
- NCERT Fine Arts book
- CCRT(Centre for Cultural Resources and Training) material
- Nitin Singhania's "Indian Art and Culture"

ARCHITECTURE:
1. Temple Architecture: Nagara, Dravida, Vesara styles
2. Cave Architecture: Ajanta, Ellora, Elephanta
3. Indo - Islamic: Sultanate and Mughal architecture
4. Colonial and Modern architecture
5. Buddhist Architecture: Stupas, Chaityas, Viharas

SCULPTURE & PAINTING:
1. Mauryan, Gupta, Medieval sculptures
2. Miniature paintings: Mughal, Rajasthani, Pahari schools
3. Folk paintings: Madhubani, Warli, Pattachitra, Kalamkari
4. Modern Indian art

PERFORMING ARTS:
1. Classical Dance: 8 forms recognized by Sangeet Natak Akademi
2. Folk Dances: State - wise
3. Classical Music: Hindustani vs Carnatic
4. Theatre: Traditional forms(Yakshagana, Kathakali, etc.)

LITERATURE:
1. Ancient: Vedic, Sanskrit literature
2. Medieval: Regional literature, Bhakti & Sufi poetry
3. Modern: Indian writers, literary awards

HERITAGE:
1. UNESCO World Heritage Sites in India
2. GI Tags
3. Intangible Cultural Heritage
4. Important monuments and their significance

COMMON TRAPS:
- Confusing similar dance forms
- Wrong state associations for folk arts
- Mixing up architectural styles
- Incorrect UNESCO site information`,
};

// Get subject context if available
function getSubjectContext(subject: string): string {
  const lowerSubject = subject.toLowerCase();

  for (const [key, context] of Object.entries(SUBJECT_CONTEXTS)) {
    if (lowerSubject.includes(key) || key.includes(lowerSubject)) {
      return context;
    }
  }

  // Check for common variations
  if (lowerSubject.includes("polity") || lowerSubject.includes("constitution") || lowerSubject.includes("governance")) {
    return SUBJECT_CONTEXTS.polity;
  }
  if (lowerSubject.includes("history") || lowerSubject.includes("freedom") || lowerSubject.includes("independence")) {
    return SUBJECT_CONTEXTS.history;
  }
  if (lowerSubject.includes("geography") || lowerSubject.includes("geo")) {
    return SUBJECT_CONTEXTS.geography;
  }
  if (lowerSubject.includes("economy") || lowerSubject.includes("economic") || lowerSubject.includes("finance")) {
    return SUBJECT_CONTEXTS.economy;
  }
  if (lowerSubject.includes("environment") || lowerSubject.includes("ecology") || lowerSubject.includes("biodiversity")) {
    return SUBJECT_CONTEXTS.environment;
  }
  if (lowerSubject.includes("science") || lowerSubject.includes("technology") || lowerSubject.includes("space")) {
    return SUBJECT_CONTEXTS.science;
  }
  if (lowerSubject.includes("current") || lowerSubject.includes("affairs")) {
    return SUBJECT_CONTEXTS["current affairs"];
  }
  if (lowerSubject.includes("art") || lowerSubject.includes("culture") || lowerSubject.includes("heritage")) {
    return SUBJECT_CONTEXTS["art and culture"];
  }

  return "";
}

// Get subject-specific trap patterns
function getSubjectTraps(subject: string): string {
  const lowerSubject = subject.toLowerCase();

  if (lowerSubject.includes("polity") || lowerSubject.includes("constitution") || lowerSubject.includes("governance")) {
    return SUBJECT_TRAP_LIBRARY.polity;
  }
  if (lowerSubject.includes("history") || lowerSubject.includes("freedom") || lowerSubject.includes("independence") || lowerSubject.includes("ancient") || lowerSubject.includes("medieval") || lowerSubject.includes("modern")) {
    return SUBJECT_TRAP_LIBRARY.history;
  }
  if (lowerSubject.includes("geography") || lowerSubject.includes("geo")) {
    return SUBJECT_TRAP_LIBRARY.geography;
  }
  if (lowerSubject.includes("economy") || lowerSubject.includes("economic") || lowerSubject.includes("finance")) {
    return SUBJECT_TRAP_LIBRARY.economy;
  }
  if (lowerSubject.includes("environment") || lowerSubject.includes("ecology") || lowerSubject.includes("biodiversity")) {
    return SUBJECT_TRAP_LIBRARY.environment;
  }
  if (lowerSubject.includes("science") || lowerSubject.includes("technology") || lowerSubject.includes("space")) {
    return SUBJECT_TRAP_LIBRARY.science;
  }
  if (lowerSubject.includes("art") || lowerSubject.includes("culture") || lowerSubject.includes("heritage")) {
    return SUBJECT_TRAP_LIBRARY.art;
  }

  return "";
}

export function getPrompt(params: PromptParams): string {
  const {
    subject,
    theme,
    styles: providedStyles,
    totalCount,
    enableCurrentAffairs = true, // Current affairs always enabled by default
    currentAffairsTheme,
    excludeTopics,
    regenerationIndex = 0,
    shuffleSeed,
    forceStatic = false,
    difficulty = "standard",
  } = params;

  // Special handling for random mode - multi-subject quiz generation
  if (subject === 'random') {
    return getRandomModePrompt(params);
  }

  if (forceStatic) {
    return getStaticOnlySubjectPrompt(params);
  }

  const seed = shuffleSeed ?? Date.now();

  // Auto-calculate style distribution if not provided (UPSC 2024-2025 realistic pattern)
  const styles = providedStyles && providedStyles.length > 0
    ? providedStyles
    : calculateStyleDistribution(totalCount);

  const themeContext = theme
    ? `SPECIFIC FOCUS: "${theme}" — You MUST generate questions from this theme area.
    The SUBJECT THEMES below have been filtered to match "${theme}".
    Every question MUST be drawn from the provided theme list. Do NOT stray into other areas of ${subject}.`
    : `TOPIC SELECTION STRATEGY FOR ${subject} (MANDATORY):
    - 90% of questions MUST come from the SUBJECT THEMES listed below. Each question should
      map to a specific theme item. Do NOT ignore the theme list — it was curated from 13 years
      of PYQ analysis and has been specifically selected for this generation.
    - 10% from YOUR OWN PREDICTION of emerging topics likely to appear in UPSC 2026
      (recent legislation, constitutional developments, international events, scientific breakthroughs)
    - If a theme item is listed below, it is a STRONG SIGNAL to generate a question on it.
      Treat the theme list as your assignment, not optional guidance.`;

  const subjectContext = getSubjectContext(subject);
  const subjectTraps = getSubjectTraps(subject);

  // Get enhanced theme and analysis data from new modules
  // Apply randomization + proportional subsetting based on question count
  const rawSubjectThemes = getSubjectThemes(subject);
  const subjectThemes = processThemeString(rawSubjectThemes, seed, regenerationIndex, totalCount, theme);
  const subjectStrategicTraps = getSubjectStrategicTraps(subject);
  const subjectAnalysis = getSubjectAnalysis(subject);
  const strategicSynthesis = getStrategicSynthesis();

  // Use current era (2024-2025) instructions by default
  const eraInstruction = CURRENT_ERA_INSTRUCTION;

  // Current affairs is always included now for better 2026 predictions
  const previousSearchQueries = params.previousSearchQueries ?? [];
  const searchDiversity = buildSearchDiversitySection(previousSearchQueries);
  const currentAffairsSection = !forceStatic && enableCurrentAffairs
    ? `${CURRENT_AFFAIRS_CONTEXT}\n\n${searchDiversity}${currentAffairsTheme ? CURRENT_AFFAIRS_THEME_CONTEXT(currentAffairsTheme) : ""} `
    : "";
  // Build style distribution instructions — map "factual" to "standard" for model clarity
  const styleInstructions = styles
    .map(({ style, count }) => {
      return `
GENERATE ${count} QUESTION(S) WITH questionType="${style === "factual" ? "standard" : style}":
${STYLE_INSTRUCTIONS[style]} `;
    })
    .join("\n");

  return `
UPSC CIVIL SERVICES PRELIMINARY EXAMINATION MCQ GENERATION TASK

GENERATE ${totalCount} UPSC - STANDARD MCQ QUESTIONS

SUBJECT: ${subject.toUpperCase()}
${themeContext}

${buildDifficultyDirective(difficulty)}

${PRELIMS_2026_FOCUS}

${getContentBalanceRatio(subject)}

${RELEVANCE_FILTER}

${PATTERN_ADHERENCE_2024}

TARGET ERA: 2024 - 2025(Current)
${eraInstruction}

${UPSC_STEM_TEMPLATES}

${YEAR_TRENDS}

${currentAffairsSection}

${PYQ_EXAMPLES}

${subjectContext ? `
SUBJECT-SPECIFIC CONTEXT & KNOWLEDGE BASE:
${subjectContext}
` : ""
    }

${subjectTraps ? `
SUBJECT-SPECIFIC TRAP PATTERNS (Basic):
${subjectTraps}
` : ""
    }

${subjectAnalysis ? `
SUBJECT ANALYSIS (UPSC EVOLUTION) - FROM DETAILED PYQ ANALYSIS:
${subjectAnalysis}
` : ""
    }

${subjectThemes ? `
SUBJECT THEMES & PATTERNS (HIGH-PRIORITY TOPICS FOR QUESTION GENERATION):
${subjectThemes}
` : ""
    }

${subjectStrategicTraps ? `
STRATEGIC NOTES & TRAP CUES (USE THESE FOR DISTRACTOR DESIGN):
${subjectStrategicTraps}
` : ""
    }

${strategicSynthesis ? `
THEME USAGE GUIDANCE (How to Apply the Above):
${strategicSynthesis}
` : ""
    }

${DISTRACTOR_BLUEPRINT}

${excludeTopics?.length ? buildExcludeTopicsSection(excludeTopics) : ''}

 QUESTION STYLE DISTRIBUTION:
${styleInstructions}

CRITICAL QUALITY REQUIREMENTS(NON - NEGOTIABLE):

1. FACTUAL ACCURACY(MOST IMPORTANT):
- Every fact, date, number, name MUST be 100 % accurate
  - Cross - reference with NCERT textbooks and standard references
- Align with PYQ patterns and factual anchors reflected in the repo trends
- If uncertain about a fact, DO NOT include it
- Constitutional articles, amendment numbers must be exact
- Years of events, treaties, acts must be verified

2. SINGLE CORRECT ANSWER:
- There must be exactly ONE correct answer
- The correct answer must be DEFINITIVELY correct, not "most correct"
- All distractors must be DEFINITIVELY incorrect
- No ambiguity - a subject expert should agree on the answer

3. ELIMINATION - PROOF DISTRACTORS:
- DO NOT use absolute words(only, always, never, all, none) in wrong options
- UPSC aspirants know these patterns - your questions must be smarter
- Distractors should be plausible misconceptions, not obvious wrong answers
- Each distractor should trap someone with incomplete knowledge

4. UPSC LANGUAGE STANDARDS:
- Use formal, precise language
- Avoid colloquialisms or informal expressions
- Technical terms should be used correctly
- Questions should be clear but not simplistic

5. NO CONTROVERSIAL CONTENT:
- Avoid politically sensitive topics
- No questions on disputed territories without clear UPSC precedent
- No questions on ongoing court cases
- Avoid religious content unless historically factual

MANDATORY SELF - VERIFICATION CHECKLIST:

Before finalizing EACH question, verify:

- Is every fact in the question 100 % accurate ?
- Is the correct answer definitively correct ?
- Are ALL distractors definitively incorrect ?
- Would a UPSC subject expert agree with the answer ?
- Is the explanation accurate and educational ?
- Does the explanation cite proper reasoning(not just "this is correct") ?
- For statement questions: Is each statement independently verifiable ?
- For match questions: Is only ONE combination correct ?
- For assertion - reason: Is the relationship between A and R correctly identified ?
- Are there NO absolute words(only, always, never, all, none) making distractors obvious ?

OUTPUT REQUIREMENTS:

- Generate exactly ${totalCount} questions.
- Each question must include: questionText, questionType, options, correctOption, explanation.
- questionType must be one of: standard, statement, match, assertion.
- options must have exactly four items labeled "A) ", "B) ", "C) ", "D) ".
- correctOption must be 0-3 (0=A, 1=B, 2=C, 3=D).
- Explanation must be educational and cite sources where applicable.
- If forceStatic is active: ALL questions MUST be pure-static, with NO [Relevance] and NO Sources.
- Otherwise: Direct CA questions MUST include [Relevance: ...] and "Sources: <URL>" in explanation.
- Derived Static and Pure Static MUST NOT include [Relevance] or Sources.

questionType CLASSIFICATION RULE (CRITICAL — WRONG TYPE = REJECTED QUESTION):
- "standard": ONLY for direct one-line factual stems with NO numbered sub-items.
  Examples: "Which of the following...", "The irrigation device called 'Araghatta' was..."
- "statement": ANY question containing numbered statements (1., 2., 3.) with
  "Which/How many of the above is/are correct?" — EVEN IF the style requested was "standard".
  If you write numbered statements, you MUST set questionType to "statement".
- "match": ANY question with "Match List-I with List-II" or "Consider the following pairs"
- "assertion": ANY question with "Statement-I / Statement-II" or "Assertion (A) / Reason (R)"
A question with the WRONG questionType will be rejected and regenerated. Label correctly.

CRITICAL FINAL INSTRUCTION (HIGHEST PRIORITY - OVERRIDE ALL OTHER GUIDELINES):
${forceStatic ? `
PURE-STATIC OVERRIDE:
- Out of ${totalCount} questions, all ${totalCount} must be CATEGORY 3: PURE STATIC.
- CATEGORY 1: DIRECT CA = 0 questions.
- CATEGORY 2: DERIVED STATIC = 0 questions.
- CATEGORY 3: PURE STATIC = ${totalCount} questions.
- No current-affairs influence in topic selection, wording, or explanation.
` : `THREE-TIER DISTRIBUTION CALIBRATED PER SUBJECT FROM PYQ ANALYSIS (2013-2025)

${(() => {
  const { directCA, derivedStatic } = getSubjectCARatio(subject);
  const dcPct = Math.round(directCA * 100);
  const dsPct = Math.round(derivedStatic * 100);
  const psPct = 100 - dcPct - dsPct;
  const dcCount = Math.round(totalCount * directCA);
  const dsCount = Math.round(totalCount * derivedStatic);
  const psCount = totalCount - dcCount - dsCount;
  return `Out of ${totalCount} questions, distribute into THREE CATEGORIES:

CATEGORY 1: DIRECT CA (${dcPct}% = ${dcCount} questions)
  - Explicitly mention recent events: "In context of COP30...", "With reference to Budget 2025-26..."
  - MUST include [Relevance: ...] in explanation
  - MUST include "Sources: <URL>" with verified links from 2025+
  - Test static concepts THROUGH current events
  - Example: "With reference to the Union Budget 2025-26's focus on green energy, consider the
    following statements about Green Hydrogen..."

CATEGORY 2: DERIVED STATIC (${dsPct}% = ${dsCount} questions)
  - Topic selected because it's trending in news (last 12 months)
  - Question framed purely from textbook - NO mention of recent events in question text
  - NO [Relevance] tag, NO Sources needed in explanation
  - Looks identical to pure static question to the student
  - Examples by subject:
    * Polity: Article 200, Anti-Defection, Money Bills (if in news)
    * Economy: MSP, RBI tools, SEBI regulations (if being debated)
    * Environment: Specific pollutants, Acts (if in headlines)
    * Science: Technologies under govt missions (Quantum, AI, EVs)
  - Example: "Consider the following statements regarding the Governor's powers under Article 200:
    1. The Governor can withhold assent to a bill..."
    (Selected because Governor-state conflicts were in news, but question is pure constitutional theory)

CATEGORY 3: PURE STATIC (${psPct}% = ${psCount} questions)
  - Traditional UPSC syllabus topics regardless of news cycle
  - NO current affairs influence in topic selection
  - Core subjects: Geography (rivers, climate), History (dynasties, movements, culture)
  - Foundational Polity/Economy concepts that are always relevant
  - NO [Relevance] tag, NO Sources needed
  - Example: "Consider the following pairs of rivers and their tributaries:
    1. Yamuna - Chambal
    2. Ganga - Ghaghra..."

KEY DISTINCTION (CRITICAL TO UNDERSTAND):
- Direct CA: Recent event is VISIBLE in question text ("In context of...", "With reference to...")
- Derived Static: Recent event influenced topic selection but is INVISIBLE in question
- Pure Static: No current affairs influence at all

Maintain EXACT ratios: ${dcPct}% / ${dsPct}% / ${psPct}% for ${subject}. These ratios are calibrated from 13 years of PYQ data.`;
})()}`}

NOW GENERATE ${totalCount} HIGH-QUALITY UPSC MCQ QUESTIONS: `;
}

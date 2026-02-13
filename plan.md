# Plan: Fix Quiz Deduplication - Theme Repetition

## Problem Analysis

The core issue: **the regeneration loop sends the exact same prompt to the model every time**, so the model gravitates toward the same popular themes repeatedly. The deduplication system catches these duplicates *after* generation, but by then the API call and latency are already wasted. This creates a cycle:

1. Model generates questions → dedupe filters some as duplicates
2. Regeneration loop requests more questions → sends **identical prompt** (same subject, same theme list, same instructions)
3. Model generates the same themes again → dedupe filters again
4. Repeat 14-18 times until relaxation kicks in and duplicates get force-accepted

The dedup system is solid at *detecting* duplicates, but there was no mechanism to *steer the model away* from already-covered themes.

## Root Causes

1. **No excluded-topics feedback**: `generateQuizCall()` received the same `params` every regeneration iteration. The model had no knowledge of what was already generated or rejected.
2. **Static theme lists**: The prompts embed massive static theme lists (from PYQ analysis) that are identical every call. The model naturally picks the "safest" high-frequency themes first.
3. **Search repetition**: When grounding was enabled, the model searched for the same generic queries (e.g., "COP30", "Budget 2025-26") every time, anchoring to the same popular topics.

### Secondary Issue: Factual-Only Regeneration

Current affairs was force-enabled for ALL quizzes (`quiz.ts:90`), meaning grounding (Google Search) was **always ON**. This forced `temperature=1.0` (max randomness) and disabled `thinkingLevel: "high"` (extended thinking). For pure factual questions (static, textbook knowledge), this was backwards — they need careful reasoning, not randomness.

---

## Implemented Changes (Final State)

### Change 1: Excluded-Topics Feedback [HIGH IMPACT] ✅

**Files**: `prompts/index.ts`, `services/llm.ts`

After each generation call, we extract topic summaries from accepted questions and pass them as an exclusion list to subsequent calls. The model sees:

```
ALREADY COVERED TOPICS (DO NOT REPEAT — generate questions on DIFFERENT themes):
- Article 356 President's Rule
- Governor's discretionary powers
- ISRO Gaganyaan mission
...
```

**Implementation details:**
- `extractTopicSummary()` uses regex to pull short topic descriptors from question text
- `buildExcludeTopics()` collects topics from `finalQuestions` (accepted questions so far)
- `buildExcludeTopicsSection()` generates the prompt section
- Exclusion list grows organically as more questions are accepted across calls

**Impact**: The model now knows what it already generated and is explicitly told to seek new territory.

---

### Change 2: Theme Randomization [MEDIUM IMPACT] ✅

**File**: `prompts/index.ts`

All subject theme lists (Polity, Economy, Environment, etc.) are shuffled per quiz using a seeded PRNG, so the model encounters themes in different orders instead of always picking the first ones.

**Implementation details:**
- `seededRandom()`: Mulberry32 seeded PRNG for deterministic randomization
- `shuffleArray()`: Fisher-Yates shuffle using seeded RNG
- `parseThemeGroups()` / `reassembleThemes()`: Parse theme strings into structured groups, shuffle, and rebuild
- Seed = `shuffleSeed` (generated once per quiz) + `regenerationIndex * 7919`
- Initial call (index 0): Shuffles full theme list
- Regeneration calls (index > 0): Shuffles AND subsets to ~50% of themes (see Change 3)

---

### Change 3: Theme Subsetting for Regeneration [MEDIUM IMPACT] ✅

**File**: `prompts/index.ts`

On regeneration calls (not initial), only ~50% of themes are presented. This forces the model into less-explored territory.

**Implementation details:**
- `subsetThemes()` randomly selects a subset of theme items, biased toward keeping at least 1 per group (maintains breadth)
- Only applied when `regenerationIndex > 0` — initial call always gets the full theme list

---

### Change 4: Disable Grounding for Factual-Only Regeneration [MEDIUM IMPACT] ✅

**File**: `services/llm.ts`

When the regeneration loop enters factual-only mode, grounding is now disabled. One-line change:
```typescript
const regenGrounding = factualOnly ? false : groundingEnabled;
```

**Rationale:**
- Factual questions test static textbook knowledge — they don't need web search
- Without grounding: uses `thinkingLevel: "high"` (better reasoning) instead of forced `temperature=1.0`
- Removes search result anchoring that was reinforcing theme repetition
- Non-factual regeneration calls continue using grounding as before

---

### Change 5: Previous Search Query Exclusion [MEDIUM IMPACT] ✅

**Files**: `prompts/index.ts`, `services/llm.ts`

After each generation call with grounding, we extract `webSearchQueries` from the Gemini grounding metadata and accumulate them. On subsequent calls, the model sees:

```
SEARCH DIVERSITY (IMPORTANT — DO NOT REPEAT PREVIOUS SEARCHES):

You have already performed these web searches in prior generation attempts:
- "Union Budget 2025-26 India"
- "ISRO Gaganyaan mission"
...

DO NOT repeat these searches or minor variations of them.
```

**How it works:**
- Initial call: `accumulatedSearchQueries` is empty → no search diversity section → model searches freely
- After each call: extract `webSearchQueries` from grounding metadata, append to accumulator
- Regen calls: pass accumulated queries to `buildSearchDiversitySection()` which generates the exclusion prompt
- Exclusion list grows naturally with each call, organically pushing the model into unexplored territory
- Capped at 20 queries in the prompt to keep size reasonable

**Design evolution:** This went through three iterations:
1. First tried a hardcoded `CA_SEARCH_POOL` of 50+ curated search terms → too prescriptive
2. Then tried temporal anchoring (random month windows like "focus on March 2025") + query feedback → the time windows were artificial constraints. UPSC current affairs covers a 12-18 month window; pinning the model to one month is counterproductive
3. **Final approach**: query feedback only. The model's own prior searches become the exclusion list. No scripted searches, no time windows — just "don't repeat yourself, find new stuff"

---

### Change 6: Configurable Temperature for Regeneration [LOW-MEDIUM IMPACT] ✅

**Files**: `types.ts`, `services/llm.ts`

New optional env var `REGENERATION_TEMPERATURE` allows tuning diversity vs quality for regen calls without code changes.

**Implementation details:**
- Parsed from `Env` interface in `types.ts`
- If provided, overrides the default temperature for regen calls
- If not set (default), preserves Change 4's behavior split (grounding=1.0 / no-grounding=model-default)
- Initial generation call is completely untouched

---

## NOT Implemented (Decided Against)

### ~~Change 6 (original): Smarter Batching / Escalating Exclusion~~

The original plan proposed escalating exclusion aggressiveness after stalled attempts and switching to niche-only themes after 4+ failures. This was dropped because the combination of Changes 1-5 already addresses the root cause sufficiently — the regeneration loop now naturally produces diverse content instead of needing progressively more aggressive intervention.

### ~~Temporal Anchoring (Search Diversity)~~

Removed after research showed UPSC Prelims current affairs covers a **12-18 month window** (typically June of previous year through exam month). Pinning the model to a specific month like "focus on March 2025" was counterproductive — it artificially limited the model's exploration space. The previous search query exclusion (Change 5) achieves diversity more organically.

---

## Quality Preservation

All changes preserve question quality:
- **Initial generation is completely untouched** — Changes 1, 3, 4, 5 only affect regeneration calls
- **Theme randomization** only reorders, doesn't remove themes
- **No prompt content removed** — only additions for guidance
- **Change 4 improves factual quality** — extended thinking > temperature 1.0 for accuracy
- **Temperature changes are regeneration-only** — initial call keeps current behavior
- **Theme subsets only for regen** — initial call gets full list

---

## Files Modified

1. **`apps/worker/src/prompts/index.ts`** — Core logic: theme randomization, subset selection, excluded topics section, search diversity section. New utility functions: `seededRandom`, `shuffleArray`, `parseThemeGroups`, `reassembleThemes`, `subsetThemes`, `processThemeString`, `buildExcludeTopicsSection`, `buildSearchDiversitySection`.
2. **`apps/worker/src/services/llm.ts`** — Pipeline integration: new params on `GenerateQuizParams`, `extractTopicSummary()`, `buildExcludeTopics()`, search query accumulation from grounding metadata, factual-only grounding toggle, temperature override support.
3. **`apps/worker/src/types.ts`** — New `REGENERATION_TEMPERATURE` env var.

# Plan: Fix Quiz Deduplication - Theme Repetition

## Problem Analysis

The core issue: **the regeneration loop sends the exact same prompt to the model every time**, so the model gravitates toward the same popular themes repeatedly. The deduplication system catches these duplicates *after* generation, but by then the API call and latency are already wasted. This creates a cycle where:

1. Model generates questions → dedupe filters some as duplicates
2. Regeneration loop requests more questions → sends **identical prompt** (same subject, same theme list, same instructions)
3. Model generates the same themes again → dedupe filters again
4. Repeat 14-18 times until relaxation kicks in and duplicates get force-accepted

The dedup system is solid at *detecting* duplicates, but there's no mechanism to *steer the model away* from already-covered themes.

## Root Causes

1. **No excluded-topics feedback**: `generateQuizCall()` receives the same `params` every regeneration iteration. The model has no knowledge of what was already generated or rejected.
2. **Static theme lists**: The prompts embed massive static theme lists (from PYQ analysis) that are identical every call. The model naturally picks the "safest" high-frequency themes first.
3. **Temperature configuration**: When grounding is enabled, `temperature=1.0` (max). When grounding is disabled, temperature is unset (defaults to model default) and `thinkingLevel="high"` is used instead. Temperature 1.0 with grounding should provide variety, but the prompt structure is so prescriptive that it overrides temperature's randomizing effect.

## Grounding Analysis: Factual-Only Regeneration

### Current Behavior

In `quiz.ts:90`, current affairs is **force-enabled** for all quizzes:
```typescript
enableCurrentAffairs: true, // Force enable current affairs for all quizzes
```

This flows through to `generateQuiz()` where `groundingEnabled = !!enableCurrentAffairs` (line 721), which means **grounding (Google Search) is always ON** — including during factual-only regeneration calls (line 1026-1028):
```typescript
styles: factualOnly ? ["factual"] : params.styles,
enableCurrentAffairs: groundingEnabled,  // still true even for factual-only!
```

This means every factual-only regeneration call:
- Enables Google Search grounding
- Sets `temperature = 1.0` (because grounding is on)
- Disables `thinkingLevel: "high"` (because grounding is on)

### Should We Disable Grounding for Factual-Only Regeneration?

**Recommendation: YES, disable grounding for factual-only regeneration calls.** Here's why:

**Arguments FOR disabling grounding on factual regen:**

1. **Factual questions are pure static by nature.** The prompt explicitly says factual/standard questions are "Direct one-line factual stem" testing textbook knowledge — things like "The irrigation device called 'Araghatta' was..." These don't need web search.

2. **Grounding forces `temperature=1.0` and disables extended thinking.** This is the opposite of what you want for factual questions. Extended thinking (`thinkingLevel: "high"`) helps the model reason carefully about factual accuracy. Temperature 1.0 increases randomness — fine for creative current affairs framing, but counterproductive for questions that must be 100% factually accurate.

3. **Grounding adds latency and cost.** Each grounding call triggers Google Search queries. For pure static factual questions about constitutional articles, historical events, or geography, the model already knows this information. The search results may even introduce noise or outdated information.

4. **The grounding search queries contribute to theme repetition.** When the model searches for "UPSC factual questions polity 2026", it gets the same search results every time, which reinforces the same popular topics. Without grounding, the model relies on its training data, which is broader.

5. **Quality improvement potential.** With grounding disabled, factual regen would use `thinkingLevel: "high"` instead — meaning the model thinks more carefully about each question. This directly addresses your concern about maintaining quality.

**Arguments AGAINST disabling (minor):**

1. The 15% Direct CA / 25% Derived Static breakdown in the prompt still technically applies. But during factual-only regen, the model is being asked specifically for `"factual"` style questions, and the prompt for factual style says "Direct one-line factual stem" — CA framing doesn't naturally fit here.

2. Some factual questions *could* benefit from recent data. But the initial generation call (which keeps grounding) already handles the CA quota. Factual-only regen exists purely to meet the 40% factual minimum — these should be static knowledge questions.

**Verdict:** Disabling grounding for factual-only regen is a clear win: better reasoning (extended thinking), more appropriate temperature (model default instead of forced 1.0), less latency, and potentially more topic diversity (no search result anchoring).

## Proposed Changes

### Change 1: Pass Already-Covered Topics to Regeneration Prompts (High Impact)

**File**: `apps/worker/src/services/llm.ts` and `apps/worker/src/prompts/index.ts`

During the regeneration loop, collect the topics/themes of already-accepted questions and pass them as an "exclusion list" to subsequent `generateQuizCall()` invocations.

Implementation:
- After each generation round, extract topic summaries from accepted questions (using `metadata.subject` + a short topic descriptor from `questionText`)
- Add an `excludeTopics?: string[]` parameter to `GenerateQuizParams` and `PromptParams`
- In `getPrompt()` / `getRandomModePrompt()`, when `excludeTopics` is provided, inject a section like:
  ```
  ALREADY COVERED TOPICS (DO NOT REPEAT - generate questions on DIFFERENT themes):
  - Article 356 President's Rule
  - Governor's discretionary powers
  - ISRO Gaganyaan mission
  ...
  ```
- This gives the model direct signal about what to avoid

### Change 2: Randomize Theme Ordering in Prompts (Medium Impact)

**File**: `apps/worker/src/prompts/index.ts` and `apps/worker/src/prompts/themes/index.ts`

The theme lists (e.g., `POLITY_THEMES`) are large static strings. The model tends to focus on themes listed first. Randomizing the order forces different starting points.

Implementation:
- Parse theme strings into individual topic entries (split on `- ` prefixed lines)
- Shuffle them using a seeded random (seeded per-quiz to ensure different ordering per quiz, but deterministic within a quiz for debugging)
- For regeneration calls, use a different seed so the model sees themes in a different order
- This is your "randomized themes" idea — we apply it to the full list, not a subset, to preserve coverage breadth

### Change 3: Subset Selection for Regeneration Calls (Medium Impact)

**File**: `apps/worker/src/prompts/index.ts`

For regeneration calls (not the initial call), present only a **random subset** of themes that excludes already-covered areas. This reduces prompt size and forces the model into less-explored territory.

Implementation:
- Add a `regenerationIndex?: number` parameter to `PromptParams`
- On regeneration (index > 0): select ~40-50% of themes randomly, biased toward themes NOT in the exclusion list
- This complements Change 1: exclusion list tells model what to avoid, subset forces it into new territory

### Change 4: Disable Grounding for Factual-Only Regeneration (Medium Impact)

**File**: `apps/worker/src/services/llm.ts`

Currently all calls (including factual-only regen) use grounding, which forces `temperature=1.0` and disables extended thinking.

Implementation:
- In the regeneration loop, when `factualOnly` is true, pass `enableCurrentAffairs: false` instead of `groundingEnabled`
- This means factual-only regen calls will:
  - Use `thinkingLevel: "high"` (better reasoning for factual accuracy)
  - Not set temperature (use model default, more deterministic)
  - Skip Google Search (faster, no search result anchoring)
- Non-factual regeneration calls continue using grounding as before
- The change is a one-line modification in the regeneration loop:
  ```typescript
  enableCurrentAffairs: factualOnly ? false : groundingEnabled,
  ```

### Change 5: Temperature Tuning for Regeneration Calls (Low-Medium Impact)

**File**: `apps/worker/src/services/llm.ts`

For non-factual regeneration with grounding still enabled, temperature is already 1.0 (max). For factual-only regen (now without grounding per Change 4), the model default applies.

Implementation:
- Add a configurable `REGENERATION_TEMPERATURE` env var
- For regeneration calls (both factual and non-factual), allow overriding the temperature
- This lets you tune diversity vs quality without code changes
- Default: leave unset (preserve current behavior per Change 4's split)
- For the initial generation call: keep current behavior entirely — quality is good as you noted

### Change 6: Reduce Regeneration Waste with Smarter Batching (Low Impact, Quality of Life)

**File**: `apps/worker/src/services/llm.ts`

Currently regeneration uses `dedupOversampleFactor = 2` and caps at 24. When the model keeps producing the same themes, oversampling doesn't help because you get 24 copies of the same themes.

Implementation:
- After 2+ stalled attempts, increase the exclusion list aggressiveness (from Change 1)
- After 4+ stalled attempts, switch to presenting ONLY low-frequency/niche themes from the theme list
- This replaces the current approach of relaxing dedup (which accepts duplicates) with an approach that steers toward genuinely new content

## Implementation Order

1. **Change 1** (excluded topics feedback) — highest-impact fix. The model literally doesn't know what it already generated.
2. **Change 4** (disable grounding for factual regen) — easy one-liner, immediate quality + diversity benefit for factual questions.
3. **Change 2** (randomize theme order) — simple to implement, decent impact.
4. **Change 5** (temperature env var for regen) — quick addition, tunable.
5. **Change 3** (subset selection) — builds on Change 1 and 2.
6. **Change 6** (smarter batching) — refinement of the regeneration loop.

## Quality Preservation

All changes are designed to preserve question quality:
- **Initial generation is completely untouched** — Changes 1, 3, 4, 5 only affect regeneration calls
- **Change 2** (theme randomization) doesn't remove themes, just reorders them
- **No prompt content is removed** — we add exclusion guidance, not remove quality instructions
- **Change 4 improves factual quality** — extended thinking is better than temperature=1.0 for factual accuracy
- **Temperature changes are regeneration-only** — the first call that produces most questions keeps current behavior
- **Theme subsets (Change 3) are only for regeneration** — initial call gets the full theme list

## Files to Modify

1. `apps/worker/src/services/llm.ts` — Regeneration loop, parameter passing, grounding toggle, temperature
2. `apps/worker/src/prompts/index.ts` — Exclusion list injection, theme randomization, subset selection
3. `apps/worker/src/prompts/themes/index.ts` — Theme parsing and shuffling utilities

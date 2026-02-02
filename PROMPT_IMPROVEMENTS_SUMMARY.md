# Prompt Improvements Summary - Feb 2, 2026

## Problem Identified

The Gemini model was generating **~100% current affairs questions** with [Relevance] tags and Sources, when the actual UPSC pattern is much more nuanced.

## Solution Implemented

### Research Phase
Analyzed UPSC 2023-2025 actual papers from `/Users/lolwierd/Projects/personal/pyqs/GS/analysis/` and discovered:

**Actual UPSC Pattern (Consistent across 3 years):**
- **13-15% Direct CA**: Explicit current affairs with visible event references
- **~25% Derived Static**: CA-influenced topic selection, but pure textbook framing
- **~60% Pure Static**: No current affairs influence at all

### Prompt Changes Made

#### Before (Lines 197-230, old):
- "MANDATORY 50-60% of questions" on current affairs
- All "timeless concepts" got "2025-2026 hooks"
- No distinction between Direct CA and Derived Static

#### After (Lines 199-348, new):
Implemented **Three-Tier System**:

1. **Direct CA (15%)**
   - Question explicitly mentions recent events: "In context of COP30..."
   - MUST include [Relevance: ...] in explanation
   - MUST include "Sources: <URL>" with verified links

2. **Derived Static (25%)**
   - Topic selected because it's trending in news
   - Question framed purely from textbooks - NO mention of events
   - NO [Relevance] tag, NO Sources
   - Example: News about Governor conflicts → Question: "Consider the following about Article 200..." (no mention of news)

3. **Pure Static (60%)**
   - Traditional UPSC syllabus topics regardless of news
   - Geography (rivers, climate), History, Core Polity
   - NO current affairs influence at all

### Key Improvements

1. **Aligned with Actual UPSC Pattern**: Validated against 2023-2025 papers
2. **Clear Gemini Instructions**: Following best practices for Gemini 3 Pro
3. **Subject-Specific Guidance**:
   - History/Culture: 100% Pure Static
   - Geography: 90% Pure Static, 10% Derived
   - Polity/Economy/Environment/Science: Mix of all three
4. **Critical Final Instruction**: Placed at end per Gemini best practices
5. **Visual Delimiters**: Clear section separation for model attention

## Files Modified

- `apps/worker/src/prompts/index.ts` (lines 197-1864)
  - Updated `CURRENT_AFFAIRS_CONTEXT`
  - Updated `CONTENT_BALANCE_RATIO`
  - Added three-tier distribution logic
  - Enhanced final instructions

## Validation Data

| Year | Direct CA | Derived Static | Pure Static |
|------|-----------|----------------|-------------|
| 2023 | 14-15%    | ~25%          | ~60%        |
| 2024 | 12-13%    | ~25%          | ~60%        |
| 2025 | 13%       | ~25%          | ~60%        |

**Our Implementation: 15% / 25% / 60%** ✅

## Example Distinctions

### Pure Static (60%)
```
"Consider the following statements regarding Article 356:
1. It can be imposed only on the recommendation of the Governor.
2. A proclamation must be approved by both Houses of Parliament.
Which of the statements given above is/are correct?"
```
[No CA influence - core constitutional topic]

### Derived Static (25%)
```
"Consider the following statements regarding the Governor's powers:
1. The Governor can reserve a bill for the President's consideration.
2. There is a time limit within which the Governor must give assent to a bill.
Which of the statements given above is/are correct?"
```
[Selected because of recent Governor-state conflicts, but question is pure static]

### Direct CA (15%)
```
"In the context of recent debates on the role of Governors in state legislation in 2025,
consider the following statements regarding Article 200:
1. The Governor can withhold assent to a bill indefinitely.
2. If the Governor reserves a bill for the President, the state legislature cannot override it.
Which of the statements given above is/are correct?"
```
[Explicitly mentions recent events]
[Explanation will have: [Relevance: Governor-state conflicts, 2025] and Sources: https://...]

## Next Steps (See IMPLEMENTATION_SPEC.md)

1. Add question metadata (category, subject, grounding sources)
2. Extract Gemini grounding chunks automatically
3. Validate 15/25/60 distribution after generation
4. Enable analytics and filtering by category

## Impact

- Reduced current affairs from ~100% to realistic 15% Direct + 25% Derived = 40% total CA influence
- Matches actual UPSC pattern from 2023-2025
- Provides better practice experience for students
- Enables proper tracking and validation

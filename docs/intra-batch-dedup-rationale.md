# Intra-Batch Topic Deduplication — Rationale

## Problem

The model generates multiple questions on the same topic (e.g., Fifth Schedule) within a single quiz generation. The existing dedup system only caught:

1. **Fingerprint match** — hash of normalized full text. Only catches near-verbatim duplicates.
2. **Concept key match** — hash of top-8 keywords + entities. Two questions on the same topic but with different phrasing produce different keyword sets → different hash → missed.
3. **History similarity** — Jaccard on full text against DB history. Not checked against other questions in the same batch.

There was **no intra-batch similarity check**, so if the model generated 5 "Fifth Schedule" questions with different statements, all 5 passed dedup.

## Fix

### New function: `calculateTopicSimilarity` (`deduplication.ts`)

Compares "topic signatures" instead of full text. A signature is built from `extractKeyEntities` (regex-matched entities like "schedule", "article 244", "governor") + top 6 keywords by frequency. Jaccard similarity on these small (~8-12 element) signatures gives high scores for same-topic questions regardless of statement details.

Why not reuse `calculateTextSimilarity`? Full-text Jaccard on a typical 40-60 token UPSC question gives ~0.15-0.25 for same-topic questions because the statement/detail words dilute the score far below any useful threshold.

### New check in `checkAndAccept` (`llm.ts`)

Each `RuntimeDedupBucket` now tracks `intraBatchPreviews: string[]` — raw question texts accepted in the current generation. New candidates are checked against all previews using `calculateTopicSimilarity` at a configurable threshold (default 0.50, env: `DEDUP_INTRA_BATCH_TOPIC_THRESHOLD`).

### Check ordering

Placed after fingerprint and concept-key checks (O(1) hash lookups), before history checks (O(600+) loops). Cheap checks reject first; the O(n) intra-batch scan only runs for questions that pass the hash checks.

### Relaxation behavior

`intraBatch` rejections are **never** force-accepted, even at maximum relaxation level 3. Having two questions on the same topic in one quiz is always a bad user experience — better to return fewer questions than serve obvious dupes.

## Risks and Tuning

- **Over-filtering related but distinct sub-topics**: e.g., Fifth Schedule vs Sixth Schedule both match "schedule" as an entity. At 0.50 threshold they might get flagged as duplicates since they share constitutional governance vocabulary. Tunable via `DEDUP_INTRA_BATCH_TOPIC_THRESHOLD` — bump to 0.55-0.60 if over-filtering is observed.
- **Entity extraction coverage**: `extractKeyEntities` uses hardcoded regex patterns. Topics not covered by patterns fall back to proper noun detection + keyword frequency. This works for most UPSC topics but could miss niche ones. The keyword component (`extractKeywords(text, 6)`) provides a safety net.
- **Performance**: O(n²) within a batch, but n is small (20-50 questions max). Each similarity call is lightweight (regex + tokenization). No concern.

## Files Changed

- `apps/worker/src/services/deduplication.ts` — added `calculateTopicSimilarity`
- `apps/worker/src/services/llm.ts` — added `intraBatchPreviews`, `intraBatch` reason, topic similarity check, never-relax guard
- `apps/worker/src/types.ts` — added `DEDUP_INTRA_BATCH_TOPIC_THRESHOLD` env var

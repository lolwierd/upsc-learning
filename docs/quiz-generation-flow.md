# Quiz Generation Flow (Exact Runtime Behavior)

This document describes the current, code-level runtime flow for:
- Single quiz generation (`POST /api/quiz/generate`)
- Quiz set generation (`POST /api/quiz-sets/:id/generate` and scheduler-triggered runs)

All details below are based on the current worker implementation.

## Source Files

- `apps/worker/src/routes/quiz.ts`
- `apps/worker/src/services/llm.ts`
- `apps/worker/src/services/quiz-set-generator.ts`
- `apps/worker/src/routes/quiz-sets.ts`
- `apps/worker/src/services/scheduler.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`

## 1) Single Quiz Generation Flow

### 1. Request Validation and Immediate 202 Response

Entry point:
- `POST /api/quiz/generate` in `apps/worker/src/routes/quiz.ts`

Validation:
- Request is validated with `generateQuizRequestSchema` from `@mcqs/shared`.
- Required fields are `subject` and `questionCount`; `styles` defaults to `[]`; current affairs flags are present in schema.

Immediate DB write:
1. A new quiz row is inserted into `quizzes` with:
   - `status = 'generating'`
   - `question_count = body.questionCount`
   - `style = JSON.stringify(body.styles)`
2. Response is returned immediately:
   - HTTP `202`
   - `{ quizId, questionCount, status: "generating" }`

Background execution:
- Actual generation runs asynchronously via `waitUntil(...)` when available, otherwise `setImmediate(...)`.

### 2. Background Worker: `runQuizGeneration(...)`

`runQuizGeneration` calls `generateQuiz(...)` with forced behavior:
- `enableFactCheck = env.ENABLE_FACT_CHECK === "1"`
- `enableDeduplication = true`
- `enableCurrentAffairs = true` (forced)
- `currentAffairsTheme = body.currentAffairsTheme || body.theme || undefined`

#### 2.1 Generation Core (`generateQuiz` in `llm.ts`)

High-level stages:
1. Load dedupe history from DB (fingerprints and concept clusters) if dedupe enabled.
2. Perform initial LLM generation call (call index `0`) with retry/backoff.
3. Normalize + auto-fix output.
4. Filter invalid statement questions.
5. Reclassify statement-like standard questions.
6. Deduplicate accepted questions.
7. Regenerate until required count/factual minimum are met.
8. Only then start fact-check.
9. Enrich with grounding metadata.
10. Persist dedupe fingerprints/clusters asynchronously.
11. Return `questions` + `metrics`.

#### 2.2 Initial LLM Call and Retry Rules

The initial call uses `retryWithBackoff(...)`.

Retryable conditions include:
- Parse failure (response parsed to 0 questions)
- Rate limit style errors (`429`, `RESOURCE_EXHAUSTED`)
- Transient network/timeout errors (`fetch failed`, header timeout, etc.)

Config:
- `LLM_MAX_RETRIES` (default code-level constant: 15)
- `LLM_RETRY_DELAY_MS` (default 2000ms)
- Rate-limit delay base: 60000ms

#### 2.3 Regeneration Rules (Count + Factual Minimum)

After initial filtering/dedupe:
- `factualMinimum = round(count * 0.40)`
- Missing conditions:
  - `missingCount = count - finalQuestions.length`
  - `missingFactual = factualMinimum - factualStandardCount`

Regeneration phase:
- Controlled by `REGENERATION_MAX_ATTEMPTS` (default 18)
- If dedupe is on, request size is oversampled (`remaining * 2`, capped at 24)
- If factual minimum is short, regeneration is factual-only (`styles = ["factual"]`)

Progressive dedupe relaxation:
- If attempts stall (no accepted question in an iteration), dedupe relaxes:
  - Level 1: allow history-similarity rejects
  - Level 2: also allow history-concept and intra-concept rejects
  - Level 3: allow all duplicate reject reasons

Emergency phase:
- If still short, no-dedupe emergency regeneration runs
- Controlled by `REGENERATION_EMERGENCY_ATTEMPTS` (default 8)

Failure gate (important):
- If still short after normal + emergency attempts, generation throws:
  - `Failed to reach required count after regeneration attempts...`
- There is no placeholder/autofill behavior.

#### 2.4 Fact-Check Timing

Fact-check starts only after finalized count is established:
- Log emitted: `Finalized X/Y questions before fact check`
- Then:
  - `Starting fact check for X questions...`

If fact-check finds issues:
1. Attempt per-question repair via `fixFactCheckIssue(...)`
2. Run one fact-check retry pass over repaired questions

If fact-check call fails:
- Error is logged
- Generation continues with existing `finalQuestions` (unless generation already failed earlier on count shortfall)

#### 2.5 Post-processing and Metrics

After fact-check:
- If grounding enabled, metadata enrichment is applied.
- Fingerprints and clusters are saved asynchronously (fire-and-forget).
- Metrics are returned with:
  - requested/returned count
  - dedupe counts
  - validation stats
  - fact-check stats
  - token usage
  - grounding source count
  - generation duration

### 3. Quiz Status Finalization in `quiz.ts`

On success:
1. Insert all questions into `questions` table for this `quiz_id`.
2. Update quiz row:
   - `status = 'completed'`
   - `model_used = metrics.model`
3. Insert AI metrics row with `status = "success"`.

On failure (any thrown error from generation path):
1. Update quiz row:
   - `status = 'failed'`
   - `error = <message>`

### 4. Single Quiz State Machine

`quizzes.status` transitions:
- `generating -> completed`
- `generating -> failed`

No direct transition from `completed` back to `generating` in single-quiz endpoint flow.

## 2) Quiz Set Generation Flow

Quiz set generation executes a run across multiple configured set items.

### 1. Manual Trigger Endpoint

Entry point:
- `POST /api/quiz-sets/:id/generate` in `apps/worker/src/routes/quiz-sets.ts`

Pre-checks:
1. Quiz set exists.
2. Quiz set has at least 1 item.
3. No currently `running` run exists for the same set.

If checks pass:
- Calls `triggerQuizSetGeneration(...)`
- Returns HTTP `202` with `{ runId, status: "running" }`

### 2. Run Creation (`startQuizSetGeneration`)

`apps/worker/src/services/quiz-set-generator.ts`:
1. Fetch all `quiz_set_items` for the set (ordered by `sequence_number`).
2. Insert one `quiz_set_runs` row:
   - `status = 'running'`
   - `total_items = items.length`
   - `completed_items = 0`
   - `failed_items = 0`
3. Insert one `quiz_set_run_items` row per set item:
   - `status = 'pending'`

### 3. Run Execution (`executeQuizSetGeneration`)

Run items are processed sequentially.

Per run item:
1. Skip if already `completed` or `failed` (resume-safe).
2. Skip if currently `generating` and not stale (< 10 minutes).
3. Mark run item `generating`, set `started_at`, clear prior error.
4. Create or reuse placeholder quiz:
   - If existing linked quiz id missing in `quizzes`, create new quiz.
   - If existing quiz exists, reset it to `generating` and clear error.
5. Delete prior `questions` for that quiz id (important for retries/resume).
6. Call `generateQuiz(...)` (same core flow as single quiz):
   - fact-check based on env
   - dedupe enabled
   - current affairs forced on
7. Insert generated questions.
8. Mark quiz `completed`.
9. Mark run item `completed`.
10. Increment `completed_items` in run.
11. Insert AI metrics with `status = "success"`.

On per-item failure:
1. Mark placeholder quiz `failed` (if quiz id exists).
2. Mark run item `failed` with error.
3. Increment `failed_items` in run.

### 4. Final Run Consolidation

After loop:
1. Recompute completed/failed/unfinished counts directly from DB (not in-memory only).
2. Update run counters from recomputed values.
3. If unfinished items still exist, return early (another worker may still be active).
4. If no unfinished items, set final run status:
   - `failed` if all items failed
   - `partial` if some failed
   - `completed` if none failed
5. Set `completed_at` on run.
6. If run trigger was scheduled:
   - Update `quiz_set_schedules.last_run_at`
   - Update `last_run_status`
   - Update `last_run_error` summary if partial/failed

### 5. Resume Behavior

`resumeQuizSetRun(...)`:
- If run exists and status is still `running`, it restarts `executeQuizSetGeneration(...)`.
- Already completed/failed items are skipped.
- Existing generating items are treated as stale after 10 minutes.

### 6. Scheduler-triggered Runs

`apps/worker/src/services/scheduler.ts`:
1. Cron schedules are loaded from `quiz_set_schedules` where `is_enabled = 1`.
2. On trigger:
   - calls `triggerQuizSetGeneration(..., "scheduled", scheduleId)`
3. On scheduler-level failure before run creation:
   - schedule row gets:
     - `last_run_status = 'failed'`
     - `last_run_error = <message>`

### 7. Quiz Set State Machines

Run status (`quiz_set_runs.status`):
- `running -> completed`
- `running -> partial`
- `running -> failed`

Run item status (`quiz_set_run_items.status`):
- `pending -> generating -> completed`
- `pending -> generating -> failed`
- Items can remain as-is and be retried/resumed by later execution passes.

Quiz status during run item processing (`quizzes.status`):
- `generating -> completed`
- `generating -> failed`
- on resume/retry: existing quiz can be reset back to `generating` before regeneration

## 3) Observability and Debug Signals

Useful runtime logs:
- `Initial generation produced X/Y questions before filtering`
- `Regenerating ... (attempt n, requesting m)`
- `Emergency regeneration ... without dedupe`
- `Finalized X/Y questions before fact check`
- `Starting fact check for X questions...`
- `Deduplicated N question(s) (...)`

Useful API/status endpoints:
- `GET /api/quiz/:id` for single quiz status and error
- `GET /api/quiz-sets/:id/runs` for run list
- `GET /api/quiz-sets/:id/runs/:runId` for run + run item details
- `GET /api/metrics/ai` for generation metrics audit

## 4) Environment Knobs That Affect Flow

Generation retries:
- `LLM_MAX_RETRIES`
- `LLM_RETRY_DELAY_MS`

Regeneration strategy:
- `REGENERATION_MAX_ATTEMPTS` (default 18)
- `REGENERATION_EMERGENCY_ATTEMPTS` (default 8)

Dedupe tuning:
- `DEDUP_HISTORY_LIMIT`
- `DEDUP_CLUSTER_LIMIT`
- `DEDUP_HISTORY_SIM_THRESHOLD`
- `DEDUP_INTRA_CONFIRM_THRESHOLD`
- `DEDUP_HISTORY_CONFIRM_THRESHOLD`

Feature toggles:
- `ENABLE_FACT_CHECK`
- `GENERATION_MODEL`
- `FACT_CHECK_MODEL`
- `GOOGLE_VERTEX_LOCATION`

## 5) Current Contract Guarantees

For a successful generation path:
- Quiz is marked `completed`.
- Returned question count equals requested count.
- Fact-check (if enabled) only runs after count is finalized.

For unresolved count shortfall:
- Generation throws.
- Caller marks quiz or run item `failed`.
- No auto-filled placeholder questions are used.

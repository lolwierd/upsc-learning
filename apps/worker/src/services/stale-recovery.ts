/**
 * Stale Recovery Service
 * 
 * Handles recovery of quizzes/runs that were left in "generating" status
 * when the worker was restarted or crashed.
 */

import type { Env } from "../types.js";
import { resumeQuizSetRun } from "./quiz-set-generator.js";

const STALE_THRESHOLD_MINUTES = 10; // Consider "generating" status stale after 10 minutes

interface StaleQuiz {
    id: string;
    subject: string;
    created_at: number;
}

interface StaleRun {
    id: string;
    quiz_set_id: string;
    started_at: number;
}

/**
 * Recover stale quizzes that were left in "generating" status
 */
export async function recoverStaleQuizzes(env: Env): Promise<{ recovered: number }> {
    const threshold = Math.floor(Date.now() / 1000) - (STALE_THRESHOLD_MINUTES * 60);

    try {
        // Find stale quizzes
        const result = await env.DB.prepare(
            `SELECT id, subject, created_at FROM quizzes 
       WHERE status = 'generating' AND created_at < ?`
        )
            .bind(threshold)
            .all<StaleQuiz>();

        const staleQuizzes = result.results || [];

        if (staleQuizzes.length === 0) {
            return { recovered: 0 };
        }

        console.log(`[Stale Recovery] Found ${staleQuizzes.length} stale quizzes`);

        // Mark them as failed
        for (const quiz of staleQuizzes) {
            await env.DB.prepare(
                `UPDATE quizzes SET status = 'failed', error = ? WHERE id = ?`
            )
                .bind('Worker restarted during generation. Please retry.', quiz.id)
                .run();

            console.log(`[Stale Recovery] Marked quiz ${quiz.id} (${quiz.subject}) as failed`);
        }

        return { recovered: staleQuizzes.length };
    } catch (error) {
        console.error('[Stale Recovery] Failed to recover stale quizzes:', error);
        return { recovered: 0 };
    }
}

/**
 * Resume quiz set runs that were interrupted by a restart/crash.
 *
 * The Node server uses in-process background tasks (setImmediate). If the process
 * restarts mid-run, the DB status can remain `running` forever unless we resume.
 */
export async function resumeInterruptedRuns(env: Env): Promise<{ resumed: number }> {
    try {
        const runsResult = await env.DB.prepare(
            `SELECT id, quiz_set_id, started_at FROM quiz_set_runs WHERE status = 'running'`
        )
            .bind()
            .all<StaleRun>();

        const runningRuns = runsResult.results || [];

        if (runningRuns.length === 0) {
            return { resumed: 0 };
        }

        console.log(`[Stale Recovery] Found ${runningRuns.length} running quiz set run(s) to resume`);

        for (const run of runningRuns) {
            // Reset any in-flight items so the resumed worker can pick them up immediately.
            // This is safe for our production deployment model (single Node worker process).
            await env.DB.prepare(
                `UPDATE quiz_set_run_items
         SET status = 'pending', started_at = NULL
         WHERE run_id = ? AND status = 'generating'`
            )
                .bind(run.id)
                .run();

            await resumeQuizSetRun(env, run.id);
        }

        return { resumed: runningRuns.length };
    } catch (error) {
        console.error('[Stale Recovery] Failed to resume interrupted runs:', error);
        return { resumed: 0 };
    }
}

/**
 * Run all stale recovery checks
 * Call this on worker startup
 */
export async function runStaleRecovery(env: Env): Promise<void> {
    console.log('[Stale Recovery] Starting stale recovery check...');

    const [quizResult, runResult] = await Promise.all([
        recoverStaleQuizzes(env),
        resumeInterruptedRuns(env),
    ]);

    if (quizResult.recovered > 0 || runResult.resumed > 0) {
        console.log(
            `[Stale Recovery] Recovered ${quizResult.recovered} quizzes and resumed ${runResult.resumed} run(s)`
        );
    } else {
        console.log('[Stale Recovery] No stale items found');
    }
}

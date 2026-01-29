/**
 * Stale Recovery Service
 * 
 * Handles recovery of quizzes/runs that were left in "generating" status
 * when the worker was restarted or crashed.
 */

import type { Env } from "../types.js";

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
 * Recover stale quiz set runs that were left in "running" status
 */
export async function recoverStaleRuns(env: Env): Promise<{ recovered: number }> {
    const threshold = Math.floor(Date.now() / 1000) - (STALE_THRESHOLD_MINUTES * 60);

    try {
        // Find stale runs
        const result = await env.DB.prepare(
            `SELECT id, quiz_set_id, started_at FROM quiz_set_runs 
       WHERE status = 'running' AND started_at < ?`
        )
            .bind(threshold)
            .all<StaleRun>();

        const staleRuns = result.results || [];

        if (staleRuns.length === 0) {
            return { recovered: 0 };
        }

        console.log(`[Stale Recovery] Found ${staleRuns.length} stale quiz set runs`);

        const now = Math.floor(Date.now() / 1000);

        // Mark them as failed
        for (const run of staleRuns) {
            await env.DB.prepare(
                `UPDATE quiz_set_runs SET status = 'failed', completed_at = ? WHERE id = ?`
            )
                .bind(now, run.id)
                .run();

            // Also mark pending/generating run items as failed
            await env.DB.prepare(
                `UPDATE quiz_set_run_items 
         SET status = 'failed', error = 'Worker restarted during generation', completed_at = ?
         WHERE run_id = ? AND status IN ('pending', 'generating')`
            )
                .bind(now, run.id)
                .run();

            console.log(`[Stale Recovery] Marked run ${run.id} as failed`);
        }

        return { recovered: staleRuns.length };
    } catch (error) {
        console.error('[Stale Recovery] Failed to recover stale runs:', error);
        return { recovered: 0 };
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
        recoverStaleRuns(env),
    ]);

    if (quizResult.recovered > 0 || runResult.recovered > 0) {
        console.log(
            `[Stale Recovery] Recovered ${quizResult.recovered} quizzes and ${runResult.recovered} runs`
        );
    } else {
        console.log('[Stale Recovery] No stale items found');
    }
}

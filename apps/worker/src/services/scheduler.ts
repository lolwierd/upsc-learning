import cron from "node-cron";
import parser from "cron-parser";
import type { Env, DatabaseLike } from "../types.js";
import { triggerQuizSetGeneration } from "./quiz-set-generator.js";

interface ScheduleRow {
  id: string;
  quiz_set_id: string;
  cron_expression: string;
  timezone: string;
  is_enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
}

interface QuizSetRow {
  user_id: string;
}

interface ScheduledJob {
  scheduleId: string;
  quizSetId: string;
  cronExpression: string;
  timezone: string;
  task: cron.ScheduledTask;
}

export class QuizSetScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private env: Env;
  private isRunning: boolean = false;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Initialize scheduler by loading all active schedules from database
   */
  async initialize(): Promise<void> {
    console.log("🕐 Initializing quiz set scheduler...");

    const schedulesResult = await this.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE is_enabled = 1`
    ).bind().all<ScheduleRow>();

    const schedules = schedulesResult.results;
    console.log(`   Found ${schedules.length} active schedule(s)`);

    for (const schedule of schedules) {
      try {
        await this.registerSchedule(schedule);
      } catch (error) {
        console.error(
          `   ❌ Failed to register schedule ${schedule.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    this.isRunning = true;
    console.log(`✅ Scheduler initialized with ${this.jobs.size} job(s)`);
  }

  /**
   * Register a schedule and start the cron job
   */
  async registerSchedule(schedule: ScheduleRow): Promise<void> {
    // Remove existing job if any
    if (this.jobs.has(schedule.id)) {
      this.removeSchedule(schedule.id);
    }

    // Validate cron expression
    if (!cron.validate(schedule.cron_expression)) {
      throw new Error(`Invalid cron expression: ${schedule.cron_expression}`);
    }

    // Create the cron job
    const task = cron.schedule(
      schedule.cron_expression,
      async () => {
        await this.executeScheduledRun(schedule.id, schedule.quiz_set_id);
      },
      {
        scheduled: true,
        timezone: schedule.timezone,
      }
    );

    const job: ScheduledJob = {
      scheduleId: schedule.id,
      quizSetId: schedule.quiz_set_id,
      cronExpression: schedule.cron_expression,
      timezone: schedule.timezone,
      task,
    };

    this.jobs.set(schedule.id, job);

    // Update next run time in database
    await this.updateNextRunTime(schedule.id, schedule.cron_expression, schedule.timezone);

    console.log(
      `   ✓ Registered schedule ${schedule.id} for quiz set ${schedule.quiz_set_id}: ${schedule.cron_expression}`
    );
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    scheduleId: string,
    cronExpression: string,
    timezone: string,
    isEnabled: boolean
  ): Promise<void> {
    // Remove existing job
    this.removeSchedule(scheduleId);

    if (isEnabled) {
      // Get the schedule details
      const schedule = await this.env.DB.prepare(
        `SELECT * FROM quiz_set_schedules WHERE id = ?`
      )
        .bind(scheduleId)
        .first<ScheduleRow>();

      if (schedule) {
        await this.registerSchedule({
          ...schedule,
          cron_expression: cronExpression,
          timezone,
          is_enabled: 1,
        });
      }
    }
  }

  /**
   * Remove a schedule and stop its cron job
   */
  removeSchedule(scheduleId: string): void {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.task.stop();
      this.jobs.delete(scheduleId);
      console.log(`   ✓ Removed schedule ${scheduleId}`);
    }
  }

  /**
   * Execute a scheduled generation run
   */
  private async executeScheduledRun(
    scheduleId: string,
    quizSetId: string
  ): Promise<void> {
    console.log(
      `\n🕐 Executing scheduled run for quiz set ${quizSetId} (schedule: ${scheduleId})`
    );

    try {
      // Get the quiz set owner
      const quizSet = await this.env.DB.prepare(
        `SELECT user_id FROM quiz_sets WHERE id = ?`
      )
        .bind(quizSetId)
        .first<QuizSetRow>();

      if (!quizSet) {
        console.error(`   ❌ Quiz set ${quizSetId} not found`);
        return;
      }

      // Trigger generation
      const { runId } = await triggerQuizSetGeneration(
        this.env,
        quizSetId,
        quizSet.user_id,
        "scheduled",
        scheduleId
      );

      console.log(`   ✓ Started run ${runId}`);

      // Update next run time
      const schedule = this.jobs.get(scheduleId);
      if (schedule) {
        await this.updateNextRunTime(
          scheduleId,
          schedule.cronExpression,
          schedule.timezone
        );
      }
    } catch (error) {
      console.error(
        `   ❌ Failed to execute scheduled run:`,
        error instanceof Error ? error.message : error
      );

      // Update schedule with error
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        `UPDATE quiz_set_schedules SET last_run_at = ?, last_run_status = 'failed', last_run_error = ? WHERE id = ?`
      )
        .bind(now, error instanceof Error ? error.message : String(error), scheduleId)
        .run();
    }
  }

  /**
   * Calculate and update the next run time for a schedule
   */
  private async updateNextRunTime(
    scheduleId: string,
    cronExpression: string,
    timezone: string
  ): Promise<void> {
    try {
      const interval = parser.parseExpression(cronExpression, {
        tz: timezone,
      });
      const nextDate = interval.next().toDate();
      const nextRunAt = Math.floor(nextDate.getTime() / 1000);

      await this.env.DB.prepare(
        `UPDATE quiz_set_schedules SET next_run_at = ? WHERE id = ?`
      )
        .bind(nextRunAt, scheduleId)
        .run();
    } catch (error) {
      console.warn(
        `   ⚠️ Failed to calculate next run time:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Stop all scheduled jobs gracefully
   */
  stopAll(): void {
    console.log("🛑 Stopping quiz set scheduler...");
    for (const [scheduleId, job] of this.jobs) {
      job.task.stop();
      console.log(`   ✓ Stopped schedule ${scheduleId}`);
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log("✅ Scheduler stopped");
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get count of active jobs
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Reload a specific schedule from database
   */
  async reloadSchedule(scheduleId: string): Promise<void> {
    if (!this.isRunning) return;
    const schedule = await this.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE id = ?`
    )
      .bind(scheduleId)
      .first<ScheduleRow>();

    if (!schedule) {
      // Schedule was deleted, remove job
      this.removeSchedule(scheduleId);
      return;
    }

    if (schedule.is_enabled) {
      await this.registerSchedule(schedule);
    } else {
      this.removeSchedule(scheduleId);
    }
  }

  /**
   * Reload all schedules for a quiz set
   */
  async reloadQuizSetSchedule(quizSetId: string): Promise<void> {
    if (!this.isRunning) return;
    const schedule = await this.env.DB.prepare(
      `SELECT * FROM quiz_set_schedules WHERE quiz_set_id = ?`
    )
      .bind(quizSetId)
      .first<ScheduleRow>();

    if (!schedule) {
      // Find and remove any existing job for this quiz set
      for (const [scheduleId, job] of this.jobs) {
        if (job.quizSetId === quizSetId) {
          this.removeSchedule(scheduleId);
        }
      }
      return;
    }

    if (schedule.is_enabled) {
      await this.registerSchedule(schedule);
    } else {
      this.removeSchedule(schedule.id);
    }
  }
}

// Singleton instance
let schedulerInstance: QuizSetScheduler | null = null;

/**
 * Get or create the scheduler instance
 */
export function getScheduler(env: Env): QuizSetScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new QuizSetScheduler(env);
  }
  return schedulerInstance;
}

/**
 * Initialize and start the scheduler
 */
export async function initializeScheduler(env: Env): Promise<QuizSetScheduler> {
  const scheduler = getScheduler(env);
  await scheduler.initialize();
  return scheduler;
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stopAll();
    schedulerInstance = null;
  }
}

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../types";

const history = new Hono<{ Bindings: Env }>();

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  subject: z.string().optional(),
});

// Helper to parse styles from DB (handles both old string and new JSON format)
function parseStyles(styleData: unknown): string[] {
  if (typeof styleData === "string") {
    try {
      const parsed = JSON.parse(styleData);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, treat as single style (backwards compatibility)
      return [styleData];
    }
  }
  return ["factual"];
}

// Get quiz history
history.get("/", zValidator("query", historyQuerySchema), async (c) => {
  const { page, limit, subject } = c.req.valid("query");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const offset = (page - 1) * limit;

  let query = `
    SELECT q.*,
           a.id as attempt_id, a.score, a.status as attempt_status, a.submitted_at
    FROM quizzes q
    LEFT JOIN attempts a ON q.id = a.quiz_id AND a.status = 'completed'
    WHERE q.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (subject) {
    query += ` AND q.subject = ?`;
    params.push(subject);
  }

  query += ` ORDER BY q.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const results = await c.env.DB.prepare(query).bind(...params).all();

  // Get total count
  let countQuery = `SELECT COUNT(*) as total FROM quizzes WHERE user_id = ?`;
  const countParams: string[] = [userId];
  if (subject) {
    countQuery += ` AND subject = ?`;
    countParams.push(subject);
  }

  const countResult = await c.env.DB.prepare(countQuery)
    .bind(...countParams)
    .first();
  const total = (countResult?.total as number) || 0;

  const quizzes = results.results.map((q: Record<string, unknown>) => ({
    id: q.id,
    subject: q.subject,
    theme: q.theme,
    difficulty: q.difficulty,
    styles: parseStyles(q.style),
    questionCount: q.question_count,
    createdAt: q.created_at,
    attemptId: q.attempt_id,
    score: q.score,
    attemptStatus: q.attempt_status,
    submittedAt: q.submitted_at,
    status: q.status || 'completed',
    error: q.error,
  }));

  return c.json({
    quizzes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get wrong answers for review
history.get("/review/wrong", async (c) => {
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const subject = c.req.query("subject");

  let query = `
    SELECT q.question_text, q.question_type, q.options, q.correct_option, q.explanation,
           aa.selected_option, qz.subject, qz.theme
    FROM attempt_answers aa
    JOIN questions q ON aa.question_id = q.id
    JOIN attempts a ON aa.attempt_id = a.id
    JOIN quizzes qz ON a.quiz_id = qz.id
    WHERE a.user_id = ? AND aa.is_correct = 0 AND a.status = 'completed'
  `;
  const params: string[] = [userId];

  if (subject) {
    query += ` AND qz.subject = ?`;
    params.push(subject);
  }

  query += ` ORDER BY a.submitted_at DESC LIMIT 100`;

  const results = await c.env.DB.prepare(query).bind(...params).all();

  const wrongAnswers = results.results.map((r: Record<string, unknown>) => ({
    questionText: r.question_text,
    questionType: r.question_type,
    options: JSON.parse(r.options as string),
    selectedOption: r.selected_option,
    correctOption: r.correct_option,
    explanation: r.explanation,
    subject: r.subject,
    theme: r.theme,
  }));

  return c.json({ wrongAnswers });
});

// Get stats
history.get("/stats", async (c) => {
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  // Overall stats
  const overallStats = await c.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT a.id) as total_attempts,
       SUM(a.score) as total_correct,
       SUM(a.total_questions) as total_questions
     FROM attempts a
     WHERE a.user_id = ? AND a.status = 'completed'`
  )
    .bind(userId)
    .first();

  // Stats by subject
  const subjectStats = await c.env.DB.prepare(
    `SELECT
       q.subject,
       COUNT(DISTINCT a.id) as attempts,
       SUM(a.score) as correct,
       SUM(a.total_questions) as total
     FROM attempts a
     JOIN quizzes q ON a.quiz_id = q.id
     WHERE a.user_id = ? AND a.status = 'completed'
     GROUP BY q.subject
     ORDER BY attempts DESC`
  )
    .bind(userId)
    .all();

  const totalAttempts = (overallStats?.total_attempts as number) || 0;
  const totalCorrect = (overallStats?.total_correct as number) || 0;
  const totalQuestions = (overallStats?.total_questions as number) || 0;

  return c.json({
    overall: {
      totalAttempts,
      totalQuestions,
      totalCorrect,
      accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    },
    bySubject: subjectStats.results.map((s: Record<string, unknown>) => ({
      subject: s.subject,
      attempts: s.attempts,
      correct: s.correct,
      total: s.total,
      accuracy:
        (s.total as number) > 0
          ? Math.round(((s.correct as number) / (s.total as number)) * 100)
          : 0,
    })),
  });
});

// Get daily activity for contribution graph
history.get("/activity", async (c) => {
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const days = parseInt(c.req.query("days") || "365");

  // Get daily stats for the last N days
  const dailyStats = await c.env.DB.prepare(
    `SELECT
       date(a.submitted_at, 'unixepoch') as date,
       COUNT(*) as attempts,
       SUM(a.score) as correct,
       SUM(a.total_questions) as total
     FROM attempts a
     WHERE a.user_id = ?
       AND a.status = 'completed'
       AND a.submitted_at >= strftime('%s', 'now', '-' || ? || ' days')
     GROUP BY date(a.submitted_at, 'unixepoch')
     ORDER BY date ASC`
  )
    .bind(userId, days)
    .all();

  const activity = dailyStats.results.map((d: Record<string, unknown>) => ({
    date: d.date,
    attempts: d.attempts,
    correct: d.correct || 0,
    total: d.total || 0,
    accuracy: (d.total as number) > 0
      ? Math.round(((d.correct as number) / (d.total as number)) * 100)
      : 0,
  }));

  return c.json({ activity });
});

// Get stats timeline (quizzes grouped by date)
history.get("/stats/timeline", async (c) => {
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";
  const limit = parseInt(c.req.query("limit") || "50");

  // Get completed attempts with quiz details, ordered by date
  const results = await c.env.DB.prepare(
    `SELECT
       a.id as attempt_id,
       a.score,
       a.total_questions,
       a.time_taken_seconds,
       a.submitted_at,
       q.id as quiz_id,
       q.subject,
       q.theme,
       q.difficulty,
       q.style
     FROM attempts a
     JOIN quizzes q ON a.quiz_id = q.id
     WHERE a.user_id = ? AND a.status = 'completed'
     ORDER BY a.submitted_at DESC
     LIMIT ?`
  )
    .bind(userId, limit)
    .all();

  // Group by date
  const grouped = new Map<string, Array<{
    attemptId: string;
    quizId: string;
    subject: string;
    theme?: string;
    difficulty: string;
    styles: string[];
    score: number;
    totalQuestions: number;
    timeTakenSeconds: number;
    submittedAt: number;
  }>>();

  results.results.forEach((r: Record<string, unknown>) => {
    const date = new Date((r.submitted_at as number) * 1000).toISOString().split("T")[0];

    if (!grouped.has(date)) {
      grouped.set(date, []);
    }

    grouped.get(date)!.push({
      attemptId: r.attempt_id as string,
      quizId: r.quiz_id as string,
      subject: r.subject as string,
      theme: r.theme as string | undefined,
      difficulty: r.difficulty as string,
      styles: parseStyles(r.style),
      score: r.score as number,
      totalQuestions: r.total_questions as number,
      timeTakenSeconds: r.time_taken_seconds as number,
      submittedAt: r.submitted_at as number,
    });
  });

  // Convert to array format
  const timeline = Array.from(grouped.entries()).map(([date, quizzes]) => ({
    date,
    quizzes,
    totalScore: quizzes.reduce((sum, q) => sum + q.score, 0),
    totalQuestions: quizzes.reduce((sum, q) => sum + q.totalQuestions, 0),
  }));

  return c.json({ timeline });
});

export { history as historyRoutes };

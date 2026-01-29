import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Env } from "../types.js";
import { seededShuffle } from "../services/seeded-shuffle.js";
import type {
  CombinedQuestion,
  RunAttemptWithAnswers,
  RunAttemptAnswerWithQuestion,
  QuizScoreBreakdown,
  SubjectScoreBreakdown,
  Subject,
} from "@mcqs/shared";

const runAttempt = new Hono<{ Bindings: Env }>();

// ============================================
// Database Row Types
// ============================================

interface QuestionRow {
  id: string;
  quiz_id: string;
  sequence_number: number;
  question_text: string;
  question_type: string;
  options: string;
  correct_option: number;
  explanation: string;
  metadata: string | null;
}

interface RunAttemptRow {
  id: string;
  run_id: string;
  started_at: number;
  submitted_at: number | null;
  score: number | null;
  total_questions: number;
  time_taken_seconds: number | null;
  status: string;
  shuffle_seed: string;
}

interface RunAttemptAnswerRow {
  id: string;
  run_attempt_id: string;
  question_id: string;
  quiz_id: string;
  shuffled_index: number;
  selected_option: number | null;
  is_correct: number | null;
  marked_for_review: number;
  answered_at: number | null;
}

interface RunAttemptAnswerWithQuestionRow extends RunAttemptAnswerRow {
  question_text: string;
  question_type: string;
  options: string;
  correct_option: number;
  explanation: string;
  subject: string;
  theme: string | null;
  sequence_number: number;
}

interface UserSettingsRow {
  learn_mode_enabled: number;
}

// ============================================
// Request Schemas
// ============================================

const saveAnswerSchema = z.object({
  questionId: z.string(),
  selectedOption: z.number().min(0).max(3).nullable(),
  markedForReview: z.boolean().optional(),
});

// ============================================
// Routes under /api/quiz-sets/:setId/runs/:runId
// ============================================

// GET /combined-questions - Get all questions from run, shuffled
runAttempt.get("/:setId/runs/:runId/combined-questions", async (c) => {
  const setId = c.req.param("setId");
  const runId = c.req.param("runId");

  // Verify quiz set access
  const quizSet = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!quizSet) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const run = await c.env.DB.prepare(
    `SELECT id, status FROM quiz_set_runs WHERE id = ? AND quiz_set_id = ?`
  )
    .bind(runId, setId)
    .first<{ id: string; status: string }>();

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  // Get learn mode setting (match settings.ts pattern - get latest without user filter)
  const settings = await c.env.DB.prepare(
    `SELECT learn_mode_enabled FROM user_settings ORDER BY updated_at DESC LIMIT 1`
  )
    .first<UserSettingsRow>();
  const learnMode = settings?.learn_mode_enabled === 1;

  // Get all completed quizzes from this run
  const runItems = await c.env.DB.prepare(
    `SELECT quiz_id FROM quiz_set_run_items
     WHERE run_id = ? AND status = 'completed' AND quiz_id IS NOT NULL`
  )
    .bind(runId)
    .all<{ quiz_id: string }>();

  if (runItems.results.length === 0) {
    return c.json({ error: "No completed quizzes in this run" }, 400);
  }

  const quizIds = runItems.results.map((r) => r.quiz_id);
  const placeholders = quizIds.map(() => "?").join(",");

  // Get all questions from these quizzes with quiz metadata
  const questionsResult = await c.env.DB.prepare(
    `SELECT q.*, qz.subject, qz.theme
     FROM questions q
     JOIN quizzes qz ON q.quiz_id = qz.id
     WHERE q.quiz_id IN (${placeholders})
     ORDER BY q.quiz_id, q.sequence_number`
  )
    .bind(...quizIds)
    .all<QuestionRow & { subject: string; theme: string | null }>();

  // Shuffle questions using run ID as seed
  const shuffled = seededShuffle(questionsResult.results, runId);

  // Map to response format
  const questions: CombinedQuestion[] = shuffled.map((q, index) => {
    const base: CombinedQuestion = {
      id: q.id,
      quizId: q.quiz_id,
      subject: q.subject as Subject,
      theme: q.theme || undefined,
      sequenceNumber: q.sequence_number,
      shuffledIndex: index,
      questionText: q.question_text,
      questionType: q.question_type as CombinedQuestion["questionType"],
      options: JSON.parse(q.options),
      metadata: q.metadata ? JSON.parse(q.metadata) : undefined,
    };

    // Include answers in learn mode
    if (learnMode) {
      base.correctOption = q.correct_option;
      base.explanation = q.explanation;
    }

    return base;
  });

  return c.json({
    questions,
    totalQuestions: questions.length,
    learnMode,
  });
});

// POST /attempt/start - Start or resume a run attempt
runAttempt.post("/:setId/runs/:runId/attempt/start", async (c) => {
  const setId = c.req.param("setId");
  const runId = c.req.param("runId");

  // Verify quiz set access
  const quizSet = await c.env.DB.prepare(
    `SELECT id FROM quiz_sets WHERE id = ?`
  )
    .bind(setId)
    .first();

  if (!quizSet) {
    return c.json({ error: "Quiz set not found" }, 404);
  }

  const run = await c.env.DB.prepare(
    `SELECT id, status FROM quiz_set_runs WHERE id = ? AND quiz_set_id = ?`
  )
    .bind(runId, setId)
    .first<{ id: string; status: string }>();

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  // Check for existing attempt for this run
  const existingAttempt = await c.env.DB.prepare(
    `SELECT * FROM run_attempts WHERE run_id = ? ORDER BY started_at DESC LIMIT 1`
  )
    .bind(runId)
    .first<RunAttemptRow>();

  if (existingAttempt) {
    // If completed, return info about it
    if (existingAttempt.status === "completed") {
      return c.json({
        attemptId: existingAttempt.id,
        status: "completed",
        message: "Attempt already completed",
      });
    }
    // Resume in-progress attempt
    return c.json({
      attemptId: existingAttempt.id,
      status: "in_progress",
      message: "Resuming existing attempt",
    });
  }

  // Get all completed quizzes from this run
  const runItems = await c.env.DB.prepare(
    `SELECT quiz_id FROM quiz_set_run_items
     WHERE run_id = ? AND status = 'completed' AND quiz_id IS NOT NULL`
  )
    .bind(runId)
    .all<{ quiz_id: string }>();

  if (runItems.results.length === 0) {
    return c.json({ error: "No completed quizzes in this run" }, 400);
  }

  const quizIds = runItems.results.map((r) => r.quiz_id);
  const placeholders = quizIds.map(() => "?").join(",");

  // Get all questions
  const questionsResult = await c.env.DB.prepare(
    `SELECT id, quiz_id FROM questions WHERE quiz_id IN (${placeholders})`
  )
    .bind(...quizIds)
    .all<{ id: string; quiz_id: string }>();

  const totalQuestions = questionsResult.results.length;

  if (totalQuestions === 0) {
    return c.json({ error: "No questions found in this run" }, 400);
  }

  // Shuffle questions using run ID as seed
  const shuffled = seededShuffle(questionsResult.results, runId);

  // Create new attempt
  const attemptId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO run_attempts (id, run_id, user_id, started_at, total_questions, status, shuffle_seed)
     VALUES (?, ?, ?, ?, ?, 'in_progress', ?)`
  )
    .bind(attemptId, runId, "public", now, totalQuestions, runId)
    .run();

  // Create answer records for each question with shuffled index
  for (let i = 0; i < shuffled.length; i++) {
    const q = shuffled[i];
    const answerId = nanoid();
    await c.env.DB.prepare(
      `INSERT INTO run_attempt_answers (id, run_attempt_id, question_id, quiz_id, shuffled_index, marked_for_review)
       VALUES (?, ?, ?, ?, ?, 0)`
    )
      .bind(answerId, attemptId, q.id, q.quiz_id, i)
      .run();
  }

  return c.json({
    attemptId,
    status: "in_progress",
    totalQuestions,
  });
});

// ============================================
// Routes under /api/run-attempt/:id
// ============================================

// Separate router for run-attempt specific routes
const runAttemptById = new Hono<{ Bindings: Env }>();

// GET /:id - Get run attempt with answers
runAttemptById.get("/:id", async (c) => {
  const attemptId = c.req.param("id");

  const attempt = await c.env.DB.prepare(
    `SELECT ra.*, qs.name as quiz_set_name
     FROM run_attempts ra
     JOIN quiz_set_runs qsr ON ra.run_id = qsr.id
     JOIN quiz_sets qs ON qsr.quiz_set_id = qs.id
     WHERE ra.id = ?`
  )
    .bind(attemptId)
    .first<RunAttemptRow & { quiz_set_name: string }>();

  if (!attempt) {
    return c.json({ error: "Attempt not found" }, 404);
  }

  // Get learn mode setting (match settings.ts pattern - get latest without user filter)
  const settings = await c.env.DB.prepare(
    `SELECT learn_mode_enabled FROM user_settings ORDER BY updated_at DESC LIMIT 1`
  )
    .first<UserSettingsRow>();
  const learnMode = settings?.learn_mode_enabled === 1;
  const showAnswers = attempt.status === "completed" || learnMode;

  // Get answers with question details
  const answersResult = await c.env.DB.prepare(
    `SELECT raa.*,
            q.question_text, q.question_type, q.options, q.correct_option, q.explanation, q.sequence_number,
            qz.subject, qz.theme
     FROM run_attempt_answers raa
     JOIN questions q ON raa.question_id = q.id
     JOIN quizzes qz ON raa.quiz_id = qz.id
     WHERE raa.run_attempt_id = ?
     ORDER BY raa.shuffled_index ASC`
  )
    .bind(attemptId)
    .all<RunAttemptAnswerWithQuestionRow>();

  const answers: RunAttemptAnswerWithQuestion[] = answersResult.results.map((a) => ({
    id: a.id,
    runAttemptId: a.run_attempt_id,
    questionId: a.question_id,
    quizId: a.quiz_id,
    shuffledIndex: a.shuffled_index,
    selectedOption: a.selected_option,
    isCorrect: a.is_correct === 1 ? true : a.is_correct === 0 ? false : undefined,
    markedForReview: a.marked_for_review === 1,
    answeredAt: a.answered_at || undefined,
    questionText: a.question_text,
    questionType: a.question_type as RunAttemptAnswerWithQuestion["questionType"],
    options: JSON.parse(a.options),
    correctOption: showAnswers ? a.correct_option : null,
    explanation: showAnswers ? a.explanation : null,
    subject: a.subject as Subject,
    theme: a.theme || undefined,
    sequenceNumber: a.sequence_number,
  }));

  const response: RunAttemptWithAnswers = {
    id: attempt.id,
    runId: attempt.run_id,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at || undefined,
    score: attempt.score || undefined,
    totalQuestions: attempt.total_questions,
    timeTakenSeconds: attempt.time_taken_seconds || undefined,
    status: attempt.status as "in_progress" | "completed",
    shuffleSeed: attempt.shuffle_seed,
    quizSetName: attempt.quiz_set_name,
    answers,
  };

  return c.json(response);
});

// PATCH /:id/answer - Save an answer
runAttemptById.patch("/:id/answer", zValidator("json", saveAnswerSchema), async (c) => {
  const attemptId = c.req.param("id");
  const { questionId, selectedOption, markedForReview } = c.req.valid("json");

  // Verify attempt exists and is in progress
  const attempt = await c.env.DB.prepare(
    `SELECT * FROM run_attempts WHERE id = ? AND status = 'in_progress'`
  )
    .bind(attemptId)
    .first<RunAttemptRow>();

  if (!attempt) {
    return c.json({ error: "Attempt not found or already submitted" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  // Update answer
  await c.env.DB.prepare(
    `UPDATE run_attempt_answers
     SET selected_option = ?, marked_for_review = ?, answered_at = ?
     WHERE run_attempt_id = ? AND question_id = ?`
  )
    .bind(selectedOption, markedForReview ? 1 : 0, now, attemptId, questionId)
    .run();

  return c.json({ success: true });
});

// POST /:id/submit - Submit and grade the attempt
runAttemptById.post("/:id/submit", async (c) => {
  const attemptId = c.req.param("id");

  // Verify attempt exists and is in progress
  const attempt = await c.env.DB.prepare(
    `SELECT * FROM run_attempts WHERE id = ? AND status = 'in_progress'`
  )
    .bind(attemptId)
    .first<RunAttemptRow>();

  if (!attempt) {
    return c.json({ error: "Attempt not found or already submitted" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const timeTaken = now - attempt.started_at;

  // Grade answers
  const answers = await c.env.DB.prepare(
    `SELECT raa.id, raa.selected_option, raa.quiz_id, q.correct_option, qz.subject, qz.theme
     FROM run_attempt_answers raa
     JOIN questions q ON raa.question_id = q.id
     JOIN quizzes qz ON raa.quiz_id = qz.id
     WHERE raa.run_attempt_id = ?`
  )
    .bind(attemptId)
    .all<{
      id: string;
      selected_option: number | null;
      quiz_id: string;
      correct_option: number;
      subject: string;
      theme: string | null;
    }>();

  let totalScore = 0;
  const quizScores: Map<string, { subject: string; theme: string | null; score: number; total: number }> =
    new Map();
  const subjectScores: Map<string, { score: number; total: number }> = new Map();

  for (const answer of answers.results) {
    const isCorrect =
      answer.selected_option !== null && answer.selected_option === answer.correct_option;

    if (isCorrect) totalScore++;

    // Update is_correct field
    await c.env.DB.prepare(`UPDATE run_attempt_answers SET is_correct = ? WHERE id = ?`)
      .bind(isCorrect ? 1 : 0, answer.id)
      .run();

    // Track quiz scores
    const existing = quizScores.get(answer.quiz_id) || {
      subject: answer.subject,
      theme: answer.theme,
      score: 0,
      total: 0,
    };
    existing.total++;
    if (isCorrect) existing.score++;
    quizScores.set(answer.quiz_id, existing);

    // Track subject scores
    const subjectExisting = subjectScores.get(answer.subject) || { score: 0, total: 0 };
    subjectExisting.total++;
    if (isCorrect) subjectExisting.score++;
    subjectScores.set(answer.subject, subjectExisting);
  }

  // Update attempt status
  await c.env.DB.prepare(
    `UPDATE run_attempts
     SET status = 'completed', submitted_at = ?, score = ?, time_taken_seconds = ?
     WHERE id = ?`
  )
    .bind(now, totalScore, timeTaken, attemptId)
    .run();

  // Build response
  const byQuiz: QuizScoreBreakdown[] = Array.from(quizScores.entries()).map(
    ([quizId, data]) => ({
      quizId,
      subject: data.subject as Subject,
      theme: data.theme || undefined,
      score: data.score,
      totalQuestions: data.total,
      accuracy: data.total > 0 ? Math.round((data.score / data.total) * 100) : 0,
    })
  );

  const bySubject: SubjectScoreBreakdown[] = Array.from(subjectScores.entries()).map(
    ([subject, data]) => ({
      subject: subject as Subject,
      score: data.score,
      totalQuestions: data.total,
      accuracy: data.total > 0 ? Math.round((data.score / data.total) * 100) : 0,
    })
  );

  return c.json({
    score: totalScore,
    totalQuestions: attempt.total_questions,
    timeTakenSeconds: timeTaken,
    accuracy:
      attempt.total_questions > 0 ? Math.round((totalScore / attempt.total_questions) * 100) : 0,
    byQuiz,
    bySubject,
  });
});

export { runAttempt as runAttemptRoutes, runAttemptById as runAttemptByIdRoutes };

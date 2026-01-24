import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Env } from "../types";

const attempt = new Hono<{ Bindings: Env }>();

type QuizRow = {
  question_count: number;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  user_id: string;
  started_at: number;
  total_questions: number;
  status: string;
  score: number | null;
  time_taken_seconds: number | null;
  submitted_at: number | null;
};

type AttemptWithQuizRow = AttemptRow & {
  subject: string;
  theme: string | null;
  difficulty: string;
  style: string;
};

type QuestionIdRow = {
  id: string;
};

type AnswerRow = {
  id: string;
  question_id: string;
  selected_option: number | null;
  correct_option: number;
  is_correct: number | null;
  explanation: string;
  marked_for_review: number | null;
  question_text: string;
  question_type: string;
  options: string;
  sequence_number: number;
};

const startAttemptSchema = z.object({
  quizId: z.string(),
});

const saveAnswerSchema = z.object({
  questionId: z.string(),
  selectedOption: z.number().min(0).max(3).nullable(),
  markedForReview: z.boolean().optional(),
});

// Start a new attempt
attempt.post("/start", zValidator("json", startAttemptSchema), async (c) => {
  const { quizId } = c.req.valid("json");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  // Verify quiz exists and belongs to user
  const quiz = await c.env.DB.prepare(
    `SELECT * FROM quizzes WHERE id = ? AND user_id = ?`
  )
    .bind(quizId, userId)
    .first<QuizRow>();

  if (!quiz) {
    return c.json({ error: "Quiz not found" }, 404);
  }

  // Check for existing in-progress attempt
  const existingAttempt = await c.env.DB.prepare(
    `SELECT * FROM attempts WHERE quiz_id = ? AND user_id = ? AND status = 'in_progress'`
  )
    .bind(quizId, userId)
    .first<AttemptRow>();

  if (existingAttempt) {
    return c.json({
      attemptId: existingAttempt.id,
      message: "Resuming existing attempt",
    });
  }

  // Create new attempt
  const attemptId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO attempts (id, quiz_id, user_id, started_at, total_questions, status)
     VALUES (?, ?, ?, ?, ?, 'in_progress')`
  )
    .bind(attemptId, quizId, userId, now, quiz.question_count)
    .run();

  // Create empty answer records for each question
  const questions = await c.env.DB.prepare(
    `SELECT id FROM questions WHERE quiz_id = ?`
  )
    .bind(quizId)
    .all<QuestionIdRow>();

  for (const q of questions.results) {
    const answerId = nanoid();
    await c.env.DB.prepare(
      `INSERT INTO attempt_answers (id, attempt_id, question_id, marked_for_review)
       VALUES (?, ?, ?, 0)`
    )
      .bind(answerId, attemptId, q.id)
      .run();
  }

  return c.json({ attemptId });
});

// Save/update an answer
attempt.patch("/:id/answer", zValidator("json", saveAnswerSchema), async (c) => {
  const attemptId = c.req.param("id");
  const { questionId, selectedOption, markedForReview } = c.req.valid("json");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  // Verify attempt exists and is in progress
  const attemptRecord = await c.env.DB.prepare(
    `SELECT * FROM attempts WHERE id = ? AND user_id = ? AND status = 'in_progress'`
  )
    .bind(attemptId, userId)
    .first<AttemptRow>();

  if (!attemptRecord) {
    return c.json({ error: "Attempt not found or already submitted" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  // Update answer
  await c.env.DB.prepare(
    `UPDATE attempt_answers
     SET selected_option = ?, marked_for_review = ?, answered_at = ?
     WHERE attempt_id = ? AND question_id = ?`
  )
    .bind(
      selectedOption,
      markedForReview ? 1 : 0,
      now,
      attemptId,
      questionId
    )
    .run();

  return c.json({ success: true });
});

// Submit attempt and get results
attempt.post("/:id/submit", async (c) => {
  const attemptId = c.req.param("id");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  // Verify attempt exists and is in progress
  const attemptRecord = await c.env.DB.prepare(
    `SELECT * FROM attempts WHERE id = ? AND user_id = ? AND status = 'in_progress'`
  )
    .bind(attemptId, userId)
    .first<AttemptRow>();

  if (!attemptRecord) {
    return c.json({ error: "Attempt not found or already submitted" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const timeTaken = now - (attemptRecord.started_at as number);

  // Grade answers
  const answers = await c.env.DB.prepare(
    `SELECT aa.*, q.correct_option
     FROM attempt_answers aa
     JOIN questions q ON aa.question_id = q.id
     WHERE aa.attempt_id = ?`
  )
    .bind(attemptId)
    .all<Pick<AnswerRow, "id" | "selected_option" | "correct_option">>();

  let score = 0;
  for (const answer of answers.results) {
    const isCorrect =
      answer.selected_option !== null &&
      answer.selected_option === answer.correct_option;
    if (isCorrect) score++;

    // Update is_correct field
    await c.env.DB.prepare(
      `UPDATE attempt_answers SET is_correct = ? WHERE id = ?`
    )
      .bind(isCorrect ? 1 : 0, answer.id)
      .run();
  }

  // Update attempt status
  await c.env.DB.prepare(
    `UPDATE attempts
     SET status = 'completed', submitted_at = ?, score = ?, time_taken_seconds = ?
     WHERE id = ?`
  )
    .bind(now, score, timeTaken, attemptId)
    .run();

  return c.json({
    score,
    totalQuestions: attemptRecord.total_questions,
    timeTakenSeconds: timeTaken,
  });
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

// Get attempt with results
attempt.get("/:id", async (c) => {
  const attemptId = c.req.param("id");
  const userId = c.req.header("CF-Access-Authenticated-User-Email") || "anonymous";

  const attemptRecord = await c.env.DB.prepare(
    `SELECT a.*, q.subject, q.theme, q.difficulty, q.style
     FROM attempts a
     JOIN quizzes q ON a.quiz_id = q.id
     WHERE a.id = ? AND a.user_id = ?`
  )
    .bind(attemptId, userId)
    .first<AttemptWithQuizRow>();

  if (!attemptRecord) {
    return c.json({ error: "Attempt not found" }, 404);
  }

  // Get answers with question details
  const answers = await c.env.DB.prepare(
    `SELECT aa.*, q.question_text, q.question_type, q.options, q.correct_option, q.explanation, q.sequence_number
     FROM attempt_answers aa
     JOIN questions q ON aa.question_id = q.id
     WHERE aa.attempt_id = ?
     ORDER BY q.sequence_number ASC`
  )
    .bind(attemptId)
    .all<AnswerRow>();

  const formattedAnswers = answers.results.map((a) => ({
    questionId: a.question_id,
    sequenceNumber: a.sequence_number,
    questionText: a.question_text,
    questionType: a.question_type,
    options: JSON.parse(a.options),
    selectedOption: a.selected_option,
    correctOption: attemptRecord.status === "completed" ? a.correct_option : null,
    isCorrect: a.is_correct === 1 ? true : a.is_correct === 0 ? false : null,
    explanation: attemptRecord.status === "completed" ? a.explanation : null,
    markedForReview: a.marked_for_review === 1,
  }));

  return c.json({
    id: attemptRecord.id,
    quizId: attemptRecord.quiz_id,
    subject: attemptRecord.subject,
    theme: attemptRecord.theme,
    difficulty: attemptRecord.difficulty,
    styles: parseStyles(attemptRecord.style),
    status: attemptRecord.status,
    score: attemptRecord.score,
    totalQuestions: attemptRecord.total_questions,
    timeTakenSeconds: attemptRecord.time_taken_seconds,
    startedAt: attemptRecord.started_at,
    submittedAt: attemptRecord.submitted_at,
    answers: formattedAnswers,
  });
});

export { attempt as attemptRoutes };

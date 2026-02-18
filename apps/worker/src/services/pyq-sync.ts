import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../types.js";

type PyqRawQuestion = {
  id: string;
  sequenceNumber: number;
  questionText: string;
  questionType?: string;
  options: string[];
  correctOption: number;
  explanation: string;
  metadata?: Record<string, unknown>;
  isDropped?: boolean;
};

type PyqRawPaper = {
  id: string;
  theme?: string;
  styles?: string[];
  questionCount?: number;
  createdAt?: number;
  year: string;
  paper: string;
  note?: string;
  officialSource?: string;
  questions: PyqRawQuestion[];
};

type PyqSourceMeta = {
  year: string;
  paper: string;
  set: string;
  pdfFile: string;
  note?: string;
  officialSource?: string;
  droppedCount: number;
  attemptableCount: number;
};

const QUESTION_STYLES = new Set([
  "factual",
  "conceptual",
  "statement",
  "match",
  "assertion",
]);

const QUESTION_TYPES = new Set([
  "standard",
  "statement",
  "match",
  "assertion",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPyqRootCandidates(env?: Pick<Env, "PYQ_ROOT">): string[] {
  const envRoot = env?.PYQ_ROOT;
  const processRoot = typeof process !== "undefined" ? process.env.PYQ_ROOT : undefined;

  return [
    envRoot,
    processRoot,
    path.resolve(__dirname, "../../pyqs/GS"),
    path.resolve(__dirname, "../../../apps/worker/pyqs/GS"),
    path.resolve(process.cwd(), "apps/worker/pyqs/GS"),
    path.resolve(process.cwd(), "pyqs/GS"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export function resolvePyqRootDir(env?: Pick<Env, "PYQ_ROOT">): string | null {
  const candidates = getPyqRootCandidates(env);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeQuestionType(rawType: string | undefined, questionText: string): string {
  const normalized = (rawType || "").trim().toLowerCase();
  if (QUESTION_TYPES.has(normalized)) {
    return normalized;
  }

  if (
    normalized.includes("assert") ||
    normalized.includes("reason") ||
    /statement-i|statement i|assertion \(a\)/i.test(questionText)
  ) {
    return "assertion";
  }

  if (
    normalized.includes("match") ||
    /match list|list-i|list-ii|following pairs/i.test(questionText)
  ) {
    return "match";
  }

  if (
    normalized.includes("statement") ||
    normalized.includes("how many") ||
    /consider the following statements|which of the statements/i.test(questionText)
  ) {
    return "statement";
  }

  return "standard";
}

function normalizeStyles(styles: string[] | undefined): string[] {
  if (!styles || styles.length === 0) {
    return ["factual"];
  }

  const normalized = styles
    .map((style) => style.trim().toLowerCase())
    .map((style) => {
      if (QUESTION_STYLES.has(style)) return style;
      if (style.includes("statement")) return "statement";
      if (style.includes("match")) return "match";
      if (style.includes("assert")) return "assertion";
      if (style.includes("concept")) return "conceptual";
      return "factual";
    });

  return Array.from(new Set(normalized));
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
  isDropped: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(metadata || {}),
  };

  if (next.category === "static") {
    next.category = "pure-static";
  }

  if (isDropped) {
    next.isDropped = true;
  }

  return next;
}

function getPdfFileName(year: string, paper: string): string {
  return `${year}-${paper}-Set A.pdf`;
}

async function deleteRemovedQuestions(
  env: Env,
  quizId: string,
  retainedQuestionIds: string[],
): Promise<void> {
  if (retainedQuestionIds.length === 0) {
    await env.DB.prepare(`DELETE FROM questions WHERE quiz_id = ?`).bind(quizId).run();
    return;
  }

  const placeholders = retainedQuestionIds.map(() => "?").join(",");
  await env.DB.prepare(
    `DELETE FROM questions WHERE quiz_id = ? AND id NOT IN (${placeholders})`,
  )
    .bind(quizId, ...retainedQuestionIds)
    .run();
}

async function upsertPaper(env: Env, rootDir: string, fileName: string): Promise<void> {
  const fullPath = path.join(rootDir, "parsed", fileName);
  const raw = await fs.promises.readFile(fullPath, "utf8");
  const paper = JSON.parse(raw) as PyqRawPaper;

  if (!paper.id || !paper.year || !paper.paper || !Array.isArray(paper.questions)) {
    throw new Error(`Invalid PYQ schema in ${fileName}`);
  }

  const droppedCount = paper.questions.filter(
    (question) => Boolean(question.isDropped) || question.correctOption < 0,
  ).length;
  const attemptableCount = paper.questions.length - droppedCount;
  const now = Math.floor(Date.now() / 1000);

  const sourceMeta: PyqSourceMeta = {
    year: paper.year,
    paper: paper.paper,
    set: "A",
    pdfFile: getPdfFileName(paper.year, paper.paper),
    note: paper.note,
    officialSource: paper.officialSource,
    droppedCount,
    attemptableCount,
  };

  const styles = normalizeStyles(paper.styles);
  const questionCount = paper.questionCount || paper.questions.length;

  await env.DB.prepare(
    `INSERT INTO quizzes (
      id,
      user_id,
      subject,
      theme,
      style,
      question_count,
      model_used,
      created_at,
      status,
      error,
      origin,
      source_meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      theme = excluded.theme,
      style = excluded.style,
      question_count = excluded.question_count,
      model_used = excluded.model_used,
      status = excluded.status,
      error = excluded.error,
      origin = excluded.origin,
      source_meta = excluded.source_meta`
  )
    .bind(
      paper.id,
      "public",
      "random",
      paper.theme || `UPSC ${paper.year} ${paper.paper} - Previous Year Questions`,
      JSON.stringify(styles),
      questionCount,
      "pyq-import",
      paper.createdAt || now,
      "completed",
      null,
      "pyq",
      JSON.stringify(sourceMeta),
    )
    .run();

  const retainedQuestionIds: string[] = [];

  for (const question of paper.questions) {
    const isDropped = Boolean(question.isDropped) || question.correctOption < 0;
    const metadata = normalizeMetadata(question.metadata, isDropped);
    const normalizedType = normalizeQuestionType(question.questionType, question.questionText);

    retainedQuestionIds.push(question.id);

    await env.DB.prepare(
      `INSERT INTO questions (
        id,
        quiz_id,
        sequence_number,
        question_text,
        question_type,
        options,
        correct_option,
        explanation,
        metadata,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        quiz_id = excluded.quiz_id,
        sequence_number = excluded.sequence_number,
        question_text = excluded.question_text,
        question_type = excluded.question_type,
        options = excluded.options,
        correct_option = excluded.correct_option,
        explanation = excluded.explanation,
        metadata = excluded.metadata`
    )
      .bind(
        question.id,
        paper.id,
        question.sequenceNumber,
        question.questionText,
        normalizedType,
        JSON.stringify(question.options),
        question.correctOption,
        question.explanation,
        JSON.stringify(metadata),
        now,
      )
      .run();
  }

  await deleteRemovedQuestions(env, paper.id, retainedQuestionIds);
}

export async function syncPyqData(env: Env): Promise<void> {
  const rootDir = resolvePyqRootDir(env);
  if (!rootDir) {
    console.warn("PYQ sync skipped: no PYQ root directory found.");
    return;
  }

  const parsedDir = path.join(rootDir, "parsed");
  if (!fs.existsSync(parsedDir)) {
    console.warn(`PYQ sync skipped: parsed directory missing at ${parsedDir}`);
    return;
  }

  const parsedFiles = (await fs.promises.readdir(parsedDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const fileName of parsedFiles) {
    await upsertPaper(env, rootDir, fileName);
  }

  console.log(`✅ PYQ sync complete: ${parsedFiles.length} paper(s) imported from ${parsedDir}`);
}

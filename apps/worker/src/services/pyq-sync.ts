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
  passageSetId?: string;
  passageLabel?: number;
};

type PyqRawPassage = {
  label: number;
  text: string;
};

type PyqRawPassageSet = {
  id: string;
  questionRange: [number, number];
  passages: PyqRawPassage[];
};

type PyqRawPaper = {
  id: string;
  theme?: string;
  styles?: string[];
  questionCount?: number;
  createdAt?: number;
  year: string;
  paper: string;
  set?: string;
  pdfFile?: string;
  note?: string;
  officialSourceNote?: string;
  officialSource?: string;
  passageSets?: PyqRawPassageSet[];
  questions: PyqRawQuestion[];
};

type PyqSourceMeta = {
  year: string;
  paper: string;
  set: string;
  pdfFile: string;
  assetDir?: string;
  note?: string;
  officialSource?: string;
  hasAnswerKey: boolean;
  passageSets?: PyqRawPassageSet[];
  droppedCount: number;
  attemptableCount: number;
};

const QUESTION_STYLES = new Set([
  "factual",
  "conceptual",
  "statement",
  "match",
  "assertion",
  "comprehension",
  "logical_reasoning",
  "math",
  "data_interpretation",
  "decision_making",
]);

const QUESTION_TYPES = new Set([
  "standard",
  "statement",
  "match",
  "assertion",
  "comprehension",
  "logical_reasoning",
  "math",
  "data_interpretation",
  "decision_making",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPyqRootCandidates(env?: Pick<Env, "PYQ_ROOT">): string[] {
  const envRoot = env?.PYQ_ROOT;
  const processRoot = typeof process !== "undefined" ? process.env.PYQ_ROOT : undefined;

  return [
    envRoot,
    processRoot,
    path.resolve(__dirname, "../../pyqs"),
    path.resolve(__dirname, "../../../apps/worker/pyqs"),
    path.resolve(process.cwd(), "apps/worker/pyqs"),
    path.resolve(process.cwd(), "pyqs"),
    // Legacy single-paper roots still work when users point PYQ_ROOT directly at GS.
    path.resolve(__dirname, "../../pyqs/GS"),
    path.resolve(__dirname, "../../../apps/worker/pyqs/GS"),
    path.resolve(process.cwd(), "apps/worker/pyqs/GS"),
    path.resolve(process.cwd(), "pyqs/GS"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function isPyqAssetRoot(candidate: string): boolean {
  try {
    const parsedDir = path.join(candidate, "parsed");
    return fs.existsSync(parsedDir) && fs.statSync(parsedDir).isDirectory();
  } catch {
    return false;
  }
}

export function resolvePyqRootDirs(env?: Pick<Env, "PYQ_ROOT">): string[] {
  const seen = new Set<string>();
  const seenAssetDirs = new Set<string>();
  const roots: string[] = [];

  for (const candidate of getPyqRootCandidates(env)) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const resolvedCandidate = path.resolve(candidate);
    if (isPyqAssetRoot(resolvedCandidate)) {
      const assetDir = path.basename(resolvedCandidate);
      if (!seen.has(resolvedCandidate) && !seenAssetDirs.has(assetDir)) {
        seen.add(resolvedCandidate);
        seenAssetDirs.add(assetDir);
        roots.push(resolvedCandidate);
      }
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedCandidate);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) {
      continue;
    }

    const childRoots = fs.readdirSync(resolvedCandidate, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(resolvedCandidate, entry.name))
      .filter((childDir) => isPyqAssetRoot(childDir))
      .sort();

    for (const childRoot of childRoots) {
      const resolvedChildRoot = path.resolve(childRoot);
      const assetDir = path.basename(resolvedChildRoot);
      if (!seen.has(resolvedChildRoot) && !seenAssetDirs.has(assetDir)) {
        seen.add(resolvedChildRoot);
        seenAssetDirs.add(assetDir);
        roots.push(resolvedChildRoot);
      }
    }
  }

  return roots;
}

export function resolvePyqRootDir(env?: Pick<Env, "PYQ_ROOT">): string | null {
  return resolvePyqRootDirs(env)[0] || null;
}

export function resolvePyqRootDirForPaper(
  env: Pick<Env, "PYQ_ROOT">,
  assetDir?: string,
): string | null {
  const roots = resolvePyqRootDirs(env);
  if (!assetDir) {
    return roots[0] || null;
  }

  return roots.find((rootDir) => path.basename(rootDir) === assetDir) || null;
}

export function inferPyqAssetDir(paper: string | undefined): string | undefined {
  const normalized = paper?.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("CSAT") || normalized === "GS2") {
    return "CSAT";
  }

  if (normalized.startsWith("GS")) {
    return "GS";
  }

  return undefined;
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
      if (style.includes("comprehension")) return "comprehension";
      if (style.includes("logical")) return "logical_reasoning";
      if (style.includes("math")) return "math";
      if (style.includes("data")) return "data_interpretation";
      if (style.includes("decision")) return "decision_making";
      return "factual";
    });

  return Array.from(new Set(normalized));
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
  {
    hasAnswerKey,
    isDropped,
    passageLabel,
    passageSetId,
  }: {
    hasAnswerKey: boolean;
    isDropped: boolean;
    passageLabel?: number;
    passageSetId?: string;
  },
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

  if (!hasAnswerKey && !isDropped) {
    next.hasAnswerKey = false;
  }

  if (passageSetId) {
    next.passageSetId = passageSetId;
  }

  if (typeof passageLabel === "number") {
    next.passageLabel = passageLabel;
  }

  return next;
}

function hasValidCorrectOption(question: PyqRawQuestion): boolean {
  return Number.isInteger(question.correctOption) && question.correctOption >= 0 && question.correctOption < question.options.length;
}

function isDroppedQuestion(question: PyqRawQuestion): boolean {
  return Boolean(question.isDropped) || question.metadata?.isDropped === true;
}

function getPdfFileName(year: string, paper: string, set: string, assetDir: string): string {
  if (assetDir === "CSAT" || /^(CSAT|GS2)$/i.test(paper)) {
    return `${year}-GS2-CSAT-Set ${set}.pdf`;
  }

  return `${year}-${paper}-Set ${set}.pdf`;
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

  const assetDir = path.basename(rootDir);
  const droppedCount = paper.questions.filter(
    (question) => isDroppedQuestion(question),
  ).length;
  const attemptableCount = paper.questions.length - droppedCount;
  const hasAnswerKey = paper.questions.every(
    (question) => isDroppedQuestion(question) || hasValidCorrectOption(question),
  );
  const now = Math.floor(Date.now() / 1000);
  const paperSet = paper.set || "A";

  const sourceMeta: PyqSourceMeta = {
    year: paper.year,
    paper: paper.paper,
    set: paperSet,
    pdfFile: paper.pdfFile || getPdfFileName(paper.year, paper.paper, paperSet, assetDir),
    assetDir,
    note: paper.note || paper.officialSourceNote,
    officialSource: paper.officialSource,
    hasAnswerKey,
    passageSets: paper.passageSets,
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
    const isDropped = isDroppedQuestion(question);
    const answerKeyAvailable = hasValidCorrectOption(question);
    const metadata = normalizeMetadata(question.metadata, {
      hasAnswerKey: answerKeyAvailable,
      isDropped,
      passageLabel: question.passageLabel,
      passageSetId: question.passageSetId,
    });
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
        answerKeyAvailable ? question.correctOption : -1,
        question.explanation,
        JSON.stringify(metadata),
        now,
      )
      .run();
  }

  await deleteRemovedQuestions(env, paper.id, retainedQuestionIds);
}

export async function syncPyqData(env: Env): Promise<void> {
  const rootDirs = resolvePyqRootDirs(env);
  if (rootDirs.length === 0) {
    console.warn("PYQ sync skipped: no PYQ root directory found.");
    return;
  }

  let importedPaperCount = 0;

  for (const rootDir of rootDirs) {
    const parsedDir = path.join(rootDir, "parsed");
    if (!fs.existsSync(parsedDir)) {
      console.warn(`PYQ sync skipped: parsed directory missing at ${parsedDir}`);
      continue;
    }

    const parsedFiles = (await fs.promises.readdir(parsedDir))
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const fileName of parsedFiles) {
      await upsertPaper(env, rootDir, fileName);
    }

    importedPaperCount += parsedFiles.length;
  }

  console.log(`✅ PYQ sync complete: ${importedPaperCount} paper(s) imported from ${rootDirs.length} asset director${rootDirs.length === 1 ? "y" : "ies"}`);
}

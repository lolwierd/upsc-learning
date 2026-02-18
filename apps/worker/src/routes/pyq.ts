import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { Env } from "../types.js";
import { resolvePyqRootDir } from "../services/pyq-sync.js";

type PyqPaperRow = {
  id: string;
  theme: string | null;
  question_count: number;
  created_at: number;
  source_meta: string | null;
};

type PyqPaperSourceMeta = {
  year?: string;
  paper?: string;
  set?: string;
  pdfFile?: string;
  note?: string;
  officialSource?: string;
  droppedCount?: number;
  attemptableCount?: number;
};

const pyq = new Hono<{ Bindings: Env }>();

function parseSourceMeta(raw: string | null): PyqPaperSourceMeta {
  if (!raw) return {};

  try {
    return JSON.parse(raw) as PyqPaperSourceMeta;
  } catch {
    return {};
  }
}

pyq.get("/papers", async (c) => {
  const results = await c.env.DB.prepare(
    `SELECT id, theme, question_count, created_at, source_meta
     FROM quizzes
     WHERE origin = 'pyq'
     ORDER BY created_at DESC`,
  ).all<PyqPaperRow>();

  const papers = results.results
    .map((row) => {
      const sourceMeta = parseSourceMeta(row.source_meta);
      const year = sourceMeta.year || "";
      const paper = sourceMeta.paper || "GS1";
      const set = sourceMeta.set || "A";
      const droppedCount = sourceMeta.droppedCount || 0;
      const attemptableCount = sourceMeta.attemptableCount || Math.max(0, row.question_count - droppedCount);

      return {
        quizId: row.id,
        title: row.theme || `UPSC ${year} ${paper} Set ${set}`,
        year,
        paper,
        set,
        questionCount: row.question_count,
        droppedCount,
        attemptableCount,
        note: sourceMeta.note,
        officialSource: sourceMeta.officialSource,
        hasPdf: Boolean(sourceMeta.pdfFile),
        createdAt: row.created_at,
      };
    })
    .sort((a, b) => Number(b.year) - Number(a.year));

  return c.json({ papers });
});

pyq.get("/papers/:quizId/pdf", async (c) => {
  const quizId = c.req.param("quizId");

  const quiz = await c.env.DB.prepare(
    `SELECT source_meta FROM quizzes WHERE id = ? AND origin = 'pyq'`,
  )
    .bind(quizId)
    .first<{ source_meta: string | null }>();

  if (!quiz) {
    return c.json({ error: "PYQ paper not found" }, 404);
  }

  const sourceMeta = parseSourceMeta(quiz.source_meta);
  if (!sourceMeta.pdfFile) {
    return c.json({ error: "PDF not configured for this paper" }, 404);
  }

  const pyqRoot = resolvePyqRootDir(c.env);
  if (!pyqRoot) {
    return c.json({ error: "PYQ assets directory is unavailable" }, 500);
  }

  const resolvedRoot = path.resolve(pyqRoot);
  const pdfPath = path.resolve(resolvedRoot, sourceMeta.pdfFile);
  if (!pdfPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return c.json({ error: "Invalid PDF path" }, 400);
  }

  if (!fs.existsSync(pdfPath)) {
    return c.json({ error: "PDF file not found" }, 404);
  }

  const buffer = await fs.promises.readFile(pdfPath);
  const fileName = path.basename(pdfPath);

  return c.body(buffer, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Cache-Control": "public, max-age=3600",
  });
});

export { pyq as pyqRoutes };

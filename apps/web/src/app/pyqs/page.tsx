"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Button } from "@/components/ui";
import { getPyqPapers } from "@/lib/api";
import type { PyqPaperListItem } from "@mcqs/shared";

function getPyqTrack(paper: string): "GS" | "CSAT" {
  return /csat|gs2/i.test(paper) ? "CSAT" : "GS";
}

const SECTION_COPY = {
  GS: {
    title: "General Studies",
    description: "Paper I with official answers, dropped-question handling, and the standard scoring flow.",
    badgeClassName: "bg-slate-900 text-white",
    cardClassName: "border-slate-200 bg-white",
  },
  CSAT: {
    title: "CSAT",
    description: "Paper II with comprehension, reasoning, maths, and data interpretation. Current imports are practice-only until answer keys are added.",
    badgeClassName: "bg-amber-100 text-amber-900",
    cardClassName: "border-amber-200 bg-amber-50/40",
  },
} as const;

export default function PyqsPage() {
  const [papers, setPapers] = useState<PyqPaperListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPapers() {
      try {
        const result = await getPyqPapers();
        setPapers(result.papers);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load PYQ papers");
      } finally {
        setLoading(false);
      }
    }

    loadPapers();
  }, []);

  const sortedPapers = useMemo(
    () => [...papers].sort((a, b) => {
      const yearDiff = Number(b.year) - Number(a.year);
      if (yearDiff !== 0) return yearDiff;

      const paperDiff = a.paper.localeCompare(b.paper);
      if (paperDiff !== 0) return paperDiff;

      return a.set.localeCompare(b.set);
    }),
    [papers],
  );

  const sections = useMemo(() => {
    const gs: PyqPaperListItem[] = [];
    const csat: PyqPaperListItem[] = [];

    for (const paper of sortedPapers) {
      if (getPyqTrack(paper.paper) === "CSAT") {
        csat.push(paper);
      } else {
        gs.push(paper);
      }
    }

    return [
      { key: "GS" as const, papers: gs },
      { key: "CSAT" as const, papers: csat },
    ];
  }, [sortedPapers]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">PYQs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Practice year-wise UPSC GS and CSAT papers with dropped-question handling and official PDF access.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-32" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-5">
          <p className="text-red-600 font-medium">{error}</p>
        </Card>
      ) : sortedPapers.length === 0 ? (
        <Card className="p-5">
          <p className="text-gray-600">No PYQ papers available yet.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map(({ key, papers: sectionPapers }) => {
            if (sectionPapers.length === 0) return null;

            const section = SECTION_COPY[key];

            return (
              <section key={key} className="space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
                      <span className={section.badgeClassName + " rounded-full px-2.5 py-1 text-xs font-medium"}>
                        {sectionPapers.length} paper{sectionPapers.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 max-w-3xl">{section.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {sectionPapers.map((paper) => (
                    <Card key={paper.quizId} className={`p-5 flex flex-col gap-4 ${section.cardClassName}`}>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{paper.year}</h3>
                            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mt-1">
                              {paper.paper} Set {paper.set}
                            </p>
                          </div>
                          {!paper.hasAnswerKey && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900">
                              Practice Only
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-3">
                          {paper.attemptableCount} attemptable of {paper.questionCount} total
                        </p>
                        {paper.droppedCount > 0 && (
                          <p className="text-sm text-red-600 mt-1">
                            {paper.droppedCount} dropped question{paper.droppedCount > 1 ? "s" : ""}
                          </p>
                        )}
                        {paper.note && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-4">{paper.note}</p>
                        )}
                      </div>

                      <div className="mt-auto">
                        <Link href={`/quiz/${paper.quizId}`}>
                          <Button className="w-full">
                            {paper.hasAnswerKey ? "Attempt Paper" : "Practice Paper"}
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

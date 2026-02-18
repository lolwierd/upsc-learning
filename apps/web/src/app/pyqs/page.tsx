"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Button } from "@/components/ui";
import { getPyqPapers } from "@/lib/api";
import type { PyqPaperListItem } from "@mcqs/shared";

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
    () => [...papers].sort((a, b) => Number(b.year) - Number(a.year)),
    [papers],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">PYQs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Practice year-wise UPSC GS1 papers with dropped-question handling and official PDF access.
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedPapers.map((paper) => (
            <Card key={paper.quizId} className="p-5 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">{paper.year}</h2>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {paper.paper} Set {paper.set}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {paper.attemptableCount} attemptable of {paper.questionCount} total
                </p>
                {paper.droppedCount > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    {paper.droppedCount} dropped question{paper.droppedCount > 1 ? "s" : ""}
                  </p>
                )}
                {paper.note && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-3">{paper.note}</p>
                )}
              </div>

              <div className="mt-auto">
                <Link href={`/quiz/${paper.quizId}`}>
                  <Button className="w-full">Attempt Paper</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

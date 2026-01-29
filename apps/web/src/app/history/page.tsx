"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getHistory } from "@/lib/api";
import type { QuizHistoryItem, PaginationInfo } from "@mcqs/shared";
import {
  SUBJECTS,
  SUBJECT_LABELS,
  QUESTION_STYLE_LABELS,
} from "@mcqs/shared";

export default function HistoryPage() {
  const [quizzes, setQuizzes] = useState<QuizHistoryItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getHistory({
          page,
          limit: 50,
        });
        setQuizzes(data.quizzes);
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject)
        ? prev.filter((s) => s !== subject)
        : [...prev, subject]
    );
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const dateStr = date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} · ${timeStr}`;
  };

  const filteredQuizzes = selectedSubjects.length === 0
    ? quizzes
    : quizzes.filter((q) => selectedSubjects.includes(q.subject));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <CardTitle className="mb-4">Quiz History</CardTitle>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((subject) => (
            <button
              key={subject}
              onClick={() => toggleSubject(subject)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                selectedSubjects.includes(subject)
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {SUBJECT_LABELS[subject]}
            </button>
          ))}
          {selectedSubjects.length > 0 && (
            <button
              onClick={() => setSelectedSubjects([])}
              className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading history...</p>
        </Card>
      ) : error ? (
        <Card className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </Card>
      ) : filteredQuizzes.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {selectedSubjects.length > 0 ? "No quizzes found for selected subjects." : "No quizzes found."}
          </p>
          <Link href="/quiz/new">
            <Button>Create Your First Quiz</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {filteredQuizzes.map((quiz) => {
              const hasAttempt = quiz.attemptId && quiz.attemptStatus === "completed";
              const percentage = hasAttempt && quiz.score !== undefined
                ? Math.round((quiz.score / quiz.questionCount) * 100)
                : null;

              return (
                <Link
                  key={quiz.id}
                  href={
                    hasAttempt
                      ? `/quiz/${quiz.id}/results?attempt=${quiz.attemptId}`
                      : `/quiz/${quiz.id}`
                  }
                  className="block"
                >
                  <Card className="p-5 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow cursor-pointer relative">
                    <div className="flex items-center justify-between gap-4">
                      {/* Left side: All info */}
                      <div className="min-w-0">
                        {/* Title row: Subject · Date, Time */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">
                            {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
                          </h3>
                          {quiz.theme && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-sm text-gray-500 truncate">{quiz.theme}</span>
                            </>
                          )}
                          <span className="text-gray-300">·</span>
                          <span className="text-[13px] text-gray-400">{formatDateTime(quiz.createdAt)}</span>
                        </div>

                        {/* Row 2: Questions · New */}
                        <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                          <span>{quiz.questionCount} questions</span>
                          {!hasAttempt && (
                            <>
                              <span className="text-gray-300">·</span>
                              {quiz.status === 'generating' ? (
                                <span className="text-xs font-medium text-amber-500 flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                  Generating...
                                </span>
                              ) : quiz.status === 'failed' ? (
                                <span className="text-xs font-medium text-red-500">Failed</span>
                              ) : (
                                <span className="text-xs font-medium text-primary-500">New</span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Styles row */}
                        {quiz.styles.length > 0 && (
                          <p className="mt-1.5 text-xs text-gray-400 truncate">
                            {quiz.styles.map((s) => QUESTION_STYLE_LABELS[s as keyof typeof QUESTION_STYLE_LABELS]).join(" · ")}
                          </p>
                        )}
                      </div>

                      {/* Right side: Score or Button */}
                      <div className="flex-shrink-0">
                        {hasAttempt && percentage !== null ? (
                          <span
                            className={cn(
                              "text-xl font-bold tabular-nums",
                              percentage >= 80
                                ? "text-green-600"
                                : percentage >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                            )}
                          >
                            {quiz.score}/{quiz.questionCount}
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={quiz.status === 'generating' || quiz.status === 'failed'}
                          >
                            {quiz.status === 'generating' ? 'Processing' : quiz.status === 'failed' ? 'Error' : 'Take Quiz'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Percentage tag - bottom right */}
                    {hasAttempt && percentage !== null && (
                      <span
                        className={cn(
                          "absolute bottom-4 right-5 text-xs font-medium px-2 py-0.5 rounded",
                          percentage >= 80
                            ? "bg-green-50 text-green-600"
                            : percentage >= 60
                              ? "bg-amber-50 text-amber-600"
                              : "bg-red-50 text-red-600"
                        )}
                      >
                        {percentage}%
                      </span>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600 px-4">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

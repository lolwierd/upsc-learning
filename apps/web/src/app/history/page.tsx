"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getHistory } from "@/lib/api";
import type { QuizHistoryItem, PaginationInfo } from "@mcqs/shared";
import {
  SUBJECTS,
  SUBJECT_LABELS,
  DIFFICULTY_LABELS,
  QUESTION_STYLE_LABELS,
} from "@mcqs/shared";

export default function HistoryPage() {
  const [quizzes, setQuizzes] = useState<QuizHistoryItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getHistory({
          page,
          limit: 10,
          subject: subject || undefined,
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
  }, [page, subject]);

  const subjectOptions = [
    { value: "", label: "All Subjects" },
    ...SUBJECTS.map((s) => ({ value: s, label: SUBJECT_LABELS[s] })),
  ];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <CardTitle>Quiz History</CardTitle>
        <div className="w-48">
          <Select
            options={subjectOptions}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPage(1);
            }}
          />
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
      ) : quizzes.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">No quizzes found.</p>
          <Link href="/quiz/new">
            <Button>Create Your First Quiz</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {quizzes.map((quiz) => {
              const hasAttempt = quiz.attemptId && quiz.attemptStatus === "completed";
              const percentage = hasAttempt && quiz.score !== undefined
                ? Math.round((quiz.score / quiz.questionCount) * 100)
                : null;

              return (
                <Card key={quiz.id} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
                      </span>
                      {quiz.theme && (
                        <span className="text-gray-500">- {quiz.theme}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>
                        {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]}
                      </span>
                      <span>•</span>
                      <span>
                        {quiz.styles.map((s) => QUESTION_STYLE_LABELS[s as keyof typeof QUESTION_STYLE_LABELS]).join(", ")}
                      </span>
                      <span>•</span>
                      <span>{quiz.questionCount} questions</span>
                      <span>•</span>
                      <span>{formatDate(quiz.createdAt)}</span>
                    </div>
                  </div>

                  {hasAttempt && percentage !== null ? (
                    <div className="text-right">
                      <span
                        className={cn(
                          "text-2xl font-bold",
                          percentage >= 80
                            ? "text-green-600"
                            : percentage >= 60
                            ? "text-amber-600"
                            : "text-red-600"
                        )}
                      >
                        {percentage}%
                      </span>
                      <p className="text-xs text-gray-500">
                        {quiz.score}/{quiz.questionCount}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Not attempted</span>
                  )}

                  <Link
                    href={
                      hasAttempt
                        ? `/quiz/${quiz.id}/results?attempt=${quiz.attemptId}`
                        : `/quiz/${quiz.id}`
                    }
                  >
                    <Button variant="secondary" size="sm">
                      {hasAttempt ? "View Results" : "Take Quiz"}
                    </Button>
                  </Link>
                </Card>
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

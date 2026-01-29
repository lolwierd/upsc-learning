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

// Subject icons as simple SVG components
const SubjectIcons: Record<string, React.ReactNode> = {
  history: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  geography: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  polity: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  ),
  economy: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  science: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  environment: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  current_affairs: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  ),
};

// Circular progress component
const CircularProgress = ({ percentage, size = 48 }: { percentage: number; size?: number }) => {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const color = percentage >= 80 ? "text-green-500" : percentage >= 60 ? "text-amber-500" : "text-red-500";
  const bgColor = percentage >= 80 ? "text-green-100" : percentage >= 60 ? "text-amber-100" : "text-red-100";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className={bgColor}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-xs font-bold", color)}>{percentage}%</span>
      </div>
    </div>
  );
};

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
        // Fetch all quizzes (we'll filter client-side for multi-select)
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

  // Relative time formatting
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const date = new Date(timestamp * 1000);
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    // For older dates, show full date
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Filter quizzes by selected subjects (client-side)
  const filteredQuizzes = selectedSubjects.length === 0
    ? quizzes
    : quizzes.filter((q) => selectedSubjects.includes(q.subject));

  // Limit styles to show
  const getDisplayStyles = (styles: string[]) => {
    const labels = styles.map((s) => QUESTION_STYLE_LABELS[s as keyof typeof QUESTION_STYLE_LABELS]);
    if (labels.length <= 2) return labels.join(" · ");
    return `${labels.slice(0, 2).join(" · ")} +${labels.length - 2} more`;
  };


  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <CardTitle className="mb-4">Quiz History</CardTitle>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {/* All chip */}
          <button
            onClick={() => setSelectedSubjects([])}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              selectedSubjects.length === 0
                ? "bg-primary-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            All
          </button>
          {SUBJECTS.map((subject) => (
            <button
              key={subject}
              onClick={() => toggleSubject(subject)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1.5",
                selectedSubjects.includes(subject)
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {SubjectIcons[subject]}
              {SUBJECT_LABELS[subject]}
            </button>
          ))}
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
          <div className="space-y-2">
            {filteredQuizzes.map((quiz) => {
              const hasAttempt = quiz.attemptId && quiz.attemptStatus === "completed";
              const percentage = hasAttempt && quiz.score !== undefined
                ? Math.round((quiz.score / quiz.questionCount) * 100)
                : null;

              return (
                <Card key={quiz.id} className="p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left side: All info */}
                    <div className="min-w-0 flex-1">
                      {/* Title row: Icon + Subject + Time */}
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">
                          {SubjectIcons[quiz.subject] || SubjectIcons.history}
                        </span>
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
                        <span className="text-[13px] text-gray-400">{formatRelativeTime(quiz.createdAt)}</span>
                      </div>

                      {/* Row 2: Questions + New badge */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm text-gray-500">{quiz.questionCount} questions</span>
                        {!hasAttempt && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary-50 text-primary-600">
                            New
                          </span>
                        )}
                      </div>

                      {/* Styles row - limited */}
                      {quiz.styles.length > 0 && (
                        <p className="mt-1.5 text-xs text-gray-400">
                          {getDisplayStyles(quiz.styles)}
                        </p>
                      )}
                    </div>

                    {/* Right side: Score with progress ring OR Button */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {hasAttempt && percentage !== null ? (
                        <>
                          <div className="text-right mr-2">
                            <p
                              className={cn(
                                "text-lg font-bold tabular-nums",
                                percentage >= 80
                                  ? "text-green-600"
                                  : percentage >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                              )}
                            >
                              {quiz.score}/{quiz.questionCount}
                            </p>
                          </div>
                          <CircularProgress percentage={percentage} size={44} />
                          <Link href={`/quiz/${quiz.id}/results?attempt=${quiz.attemptId}`}>
                            <Button variant="secondary" size="sm">
                              Review
                            </Button>
                          </Link>
                        </>
                      ) : (
                        <Link href={`/quiz/${quiz.id}`}>
                          <Button size="sm">
                            Take Quiz
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
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

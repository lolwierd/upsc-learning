"use client";

export const runtime = "edge";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getRunAttempt } from "@/lib/api";
import type { RunAttemptWithAnswers, Subject } from "@mcqs/shared";
import { SUBJECT_LABELS } from "@mcqs/shared";

type FilterType = "all" | "wrong" | "marked";

interface SubjectScore {
  subject: Subject;
  score: number;
  total: number;
}

export default function CombinedResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const setId = params.id as string;
  const runId = params.runId as string;
  const attemptId = searchParams.get("attempt");

  const [attempt, setAttempt] = useState<RunAttemptWithAnswers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatCopyText = (
    questionText: string,
    options: string[],
    sequenceNumber: number
  ) => {
    const optionLines = options.map((option, optIndex) => {
      const label = String.fromCharCode(65 + optIndex);
      const cleaned = option.replace(/^[A-D]\)\s*/i, "");
      return `${label}) ${cleaned}`;
    });
    return `${sequenceNumber}. ${questionText}\n${optionLines.join("\n")}`;
  };

  const handleCopyQuestion = async (
    questionId: string,
    questionText: string,
    options: string[],
    sequenceNumber: number
  ) => {
    try {
      await navigator.clipboard.writeText(
        formatCopyText(questionText, options, sequenceNumber)
      );
      setCopiedQuestionId(questionId);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedQuestionId(null), 1500);
    } catch (err) {
      console.error("Failed to copy question:", err);
    }
  };

  useEffect(() => {
    async function load() {
      if (!attemptId) {
        setError("No attempt specified");
        setLoading(false);
        return;
      }

      try {
        const data = await getRunAttempt(attemptId);
        if (data.status !== "completed") {
          router.push(`/sets/${setId}/runs/${runId}/combined`);
          return;
        }
        setAttempt(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId, setId, runId, router]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading results...</p>
        </Card>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error || "Results not found"}</p>
          <Link href={`/sets/${setId}/runs/${runId}`}>
            <Button>Back to Run</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const score = attempt.score || 0;
  const total = attempt.totalQuestions;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const timeTaken = attempt.timeTakenSeconds || 0;
  const minutes = Math.floor(timeTaken / 60);
  const seconds = timeTaken % 60;

  // Calculate subject-wise breakdown
  const subjectScores = new Map<Subject, { score: number; total: number }>();
  for (const answer of attempt.answers) {
    const existing = subjectScores.get(answer.subject) || { score: 0, total: 0 };
    existing.total++;
    if (answer.isCorrect) existing.score++;
    subjectScores.set(answer.subject, existing);
  }

  const subjectBreakdown: SubjectScore[] = Array.from(subjectScores.entries()).map(
    ([subject, data]) => ({
      subject,
      score: data.score,
      total: data.total,
    })
  );

  // Sort by total questions (descending)
  subjectBreakdown.sort((a, b) => b.total - a.total);

  const wrongCount = attempt.answers.filter((a) => a.isCorrect === false).length;
  const markedCount = attempt.answers.filter((a) => a.markedForReview).length;

  const filteredAnswers = attempt.answers.filter((a) => {
    if (filter === "wrong") return a.isCorrect === false;
    if (filter === "marked") return a.markedForReview;
    return true;
  });

  const getScoreColor = () => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getSubjectAccuracyColor = (pct: number) => {
    if (pct >= 80) return "bg-green-100 text-green-700";
    if (pct >= 60) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Score Summary */}
      <Card className="mb-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Combined Quiz Complete!</h1>
          <p className="text-gray-500 mb-6">
            {attempt.quizSetName}
          </p>

          <div className="flex items-center justify-center gap-8 mb-6">
            <div>
              <p className={cn("text-5xl font-bold", getScoreColor())}>
                {score}/{total}
              </p>
              <p className="text-sm text-gray-500 mt-1">Score</p>
            </div>
            <div className="w-px h-16 bg-gray-200" />
            <div>
              <p className={cn("text-5xl font-bold", getScoreColor())}>
                {percentage}%
              </p>
              <p className="text-sm text-gray-500 mt-1">Accuracy</p>
            </div>
            <div className="w-px h-16 bg-gray-200" />
            <div>
              <p className="text-5xl font-bold text-gray-700">
                {minutes}:{String(seconds).padStart(2, "0")}
              </p>
              <p className="text-sm text-gray-500 mt-1">Time Taken</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link href={`/sets/${setId}/runs/${runId}`}>
              <Button variant="secondary">Back to Run</Button>
            </Link>
            <Link href={`/sets/${setId}`}>
              <Button>View Quiz Set</Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Subject Breakdown */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Breakdown by Subject</h2>
        <div className="space-y-3">
          {subjectBreakdown.map(({ subject, score: subScore, total: subTotal }) => {
            const pct = subTotal > 0 ? Math.round((subScore / subTotal) * 100) : 0;
            return (
              <div key={subject} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {SUBJECT_LABELS[subject]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    {subScore}/{subTotal}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full min-w-[48px] text-center",
                      getSubjectAccuracyColor(pct)
                    )}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            filter === "all"
              ? "bg-primary-100 text-primary-700"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          All ({total})
        </button>
        <button
          onClick={() => setFilter("wrong")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            filter === "wrong"
              ? "bg-red-100 text-red-700"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Wrong ({wrongCount})
        </button>
        <button
          onClick={() => setFilter("marked")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            filter === "marked"
              ? "bg-amber-100 text-amber-700"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Marked ({markedCount})
        </button>
      </div>

      {/* Questions with Answers */}
      <div className="space-y-4">
        {filteredAnswers.map((answer, displayIndex) => {
          const isCorrect = answer.isCorrect;
          const selectedOption = answer.selectedOption;
          const correctOption = answer.correctOption;

          return (
            <Card key={answer.questionId}>
              {/* Subject/Theme Badge */}
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                  {SUBJECT_LABELS[answer.subject]}
                </span>
                {answer.theme && (
                  <span className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded-full">
                    {answer.theme}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-3 mb-4">
                <span
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-medium text-sm",
                    isCorrect
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  )}
                >
                  {displayIndex + 1}
                </span>
                <div className="flex-1">
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {answer.questionText}
                  </p>
                  {answer.markedForReview && (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Marked for Review
                    </span>
                  )}
                </div>
                <button
                  onClick={() =>
                    handleCopyQuestion(
                      answer.questionId,
                      answer.questionText,
                      answer.options,
                      displayIndex + 1
                    )
                  }
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    copiedQuestionId === answer.questionId
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                  title="Copy question and options"
                >
                  {copiedQuestionId === answer.questionId ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="space-y-2 ml-11">
                {answer.options.map((option, optIndex) => {
                  const isSelected = selectedOption === optIndex;
                  const isCorrectOption = correctOption === optIndex;
                  const optionLabel = String.fromCharCode(65 + optIndex);

                  let bgColor = "bg-white border-gray-200";
                  let textColor = "text-gray-700";

                  if (isCorrectOption) {
                    bgColor = "bg-green-50 border-green-300";
                    textColor = "text-green-700";
                  } else if (isSelected && !isCorrect) {
                    bgColor = "bg-red-50 border-red-300";
                    textColor = "text-red-700";
                  }

                  return (
                    <div
                      key={optIndex}
                      className={cn(
                        "p-3 rounded-lg border flex items-start gap-3",
                        bgColor
                      )}
                    >
                      <span
                        className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                          isCorrectOption
                            ? "border-green-500 bg-green-500 text-white"
                            : isSelected
                              ? "border-red-500 bg-red-500 text-white"
                              : "border-gray-300 text-gray-500"
                        )}
                      >
                        {isCorrectOption ? "✓" : isSelected ? "✗" : optionLabel}
                      </span>
                      <span className={cn("text-sm", textColor)}>{option}</span>
                    </div>
                  );
                })}
              </div>

              {/* Explanation */}
              {answer.explanation && (
                <div className="mt-4 ml-11 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Explanation
                  </p>
                  <p className="text-sm text-blue-700 whitespace-pre-wrap">
                    {answer.explanation}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filteredAnswers.length === 0 && (
        <Card className="text-center py-8">
          <p className="text-gray-500">
            {filter === "wrong"
              ? "No wrong answers. Great job!"
              : "No marked questions."}
          </p>
        </Card>
      )}
    </div>
  );
}

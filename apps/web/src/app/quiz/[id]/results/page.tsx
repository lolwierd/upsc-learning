"use client";

export const runtime = "edge";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getAttempt } from "@/lib/api";
import type { AttemptWithAnswers } from "@mcqs/shared";
import { SUBJECT_LABELS } from "@mcqs/shared";

type FilterType = "all" | "wrong" | "marked";

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const quizId = params.id as string;
  const attemptId = searchParams.get("attempt");

  const [attempt, setAttempt] = useState<AttemptWithAnswers | null>(null);
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
        const data = await getAttempt(attemptId);
        if (data.status !== "completed") {
          router.push(`/quiz/${quizId}`);
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
  }, [attemptId, quizId, router]);

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
          <Button onClick={() => router.push("/")}>Go to Dashboard</Button>
        </Card>
      </div>
    );
  }

  const score = attempt.score || 0;
  const total = attempt.totalQuestions;
  const percentage = Math.round((score / total) * 100);
  const timeTaken = attempt.timeTakenSeconds || 0;
  const minutes = Math.floor(timeTaken / 60);
  const seconds = timeTaken % 60;

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Score Summary */}
      <Card className="mb-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Quiz Complete!</h1>
          <p className="text-gray-500 mb-6">
            {SUBJECT_LABELS[attempt.subject as keyof typeof SUBJECT_LABELS]}
            {attempt.theme && ` - ${attempt.theme}`}
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
            <Link href={`/quiz/${quizId}`}>
              <Button variant="secondary">Retake Quiz</Button>
            </Link>
            <Link href="/quiz/new">
              <Button>New Quiz</Button>
            </Link>
          </div>
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
        {filteredAnswers.map((answer) => {
          const isCorrect = answer.isCorrect;
          const selectedOption = answer.selectedOption;
          const correctOption = answer.correctOption;

          return (
            <Card
              key={answer.questionId}
            >
              <div className="flex items-start gap-3 mb-4">
                <span
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-medium text-sm",
                    isCorrect
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  )}
                >
                  {answer.sequenceNumber}
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
                      answer.sequenceNumber
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

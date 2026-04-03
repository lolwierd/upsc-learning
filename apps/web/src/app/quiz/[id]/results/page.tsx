"use client";

export const runtime = "edge";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Markdown } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getAttempt, getQuizSet, getQuizSetRun } from "@/lib/api";
import type {
  AttemptAnswerWithQuestion,
  AttemptWithAnswers,
  QuizSetRunWithItems,
  QuizSetWithSchedule,
} from "@mcqs/shared";
import { SUBJECT_LABELS } from "@mcqs/shared";
import { CategoryBadge, QuizStats, GroundingSourcesList } from "@/components/quiz";

type FilterType = "all" | "wrong" | "wrong_marked" | "wrong_unmarked" | "marked";

const GS_CORRECT_MARKS = 2;
const GS_WRONG_PENALTY = 0.66;
const CSAT_CORRECT_MARKS = 2.5;
const CSAT_WRONG_PENALTY = 0.83;

function isCsatQuestion(answer: Pick<AttemptAnswerWithQuestion, "questionType" | "metadata">) {
  return /csat|gs2/i.test(String(answer.metadata?.paper || "")) || [
    "comprehension",
    "logical_reasoning",
    "math",
    "data_interpretation",
    "decision_making",
  ].includes(answer.questionType);
}

function formatUpscScore(score: number) {
  return score.toFixed(2).replace(/\.?0+$/, "");
}

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const quizId = params.id as string;
  const attemptId = searchParams.get("attempt");
  const setId = searchParams.get("setId");
  const runId = searchParams.get("runId");

  const [attempt, setAttempt] = useState<AttemptWithAnswers | null>(null);
  const [run, setRun] = useState<QuizSetRunWithItems | null>(null);
  const [quizSet, setQuizSet] = useState<QuizSetWithSchedule | null>(null);
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
        if (setId && runId) {
          const [runResult, setResult] = await Promise.allSettled([
            getQuizSetRun(setId, runId),
            getQuizSet(setId),
          ]);
          if (runResult.status === "fulfilled") {
            setRun(runResult.value);
          }
          if (setResult.status === "fulfilled") {
            setQuizSet(setResult.value);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId, quizId, router, runId, setId]);

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

  const correctCount = attempt.answers.filter((a) => a.isCorrect === true).length;
  const wrongCount = attempt.answers.filter((a) => a.isCorrect === false).length;
  const markedCount = attempt.answers.filter((a) => a.markedForReview).length;
  const markedWrongCount = attempt.answers.filter(
    (a) => a.markedForReview && a.isCorrect === false
  ).length;
  const unmarkedWrongCount = attempt.answers.filter(
    (a) => !a.markedForReview && a.isCorrect === false
  ).length;
  const unattemptedCount = attempt.answers.filter((a) => a.selectedOption === null).length;
  const csatQuestionCount = attempt.answers.filter((a) => isCsatQuestion(a)).length;
  const gsQuestionCount = total - csatQuestionCount;
  const upscScore = attempt.answers.reduce((sum, answer) => {
    if (answer.isCorrect === true) {
      return sum + (isCsatQuestion(answer) ? CSAT_CORRECT_MARKS : GS_CORRECT_MARKS);
    }
    if (answer.isCorrect === false) {
      return sum - (isCsatQuestion(answer) ? CSAT_WRONG_PENALTY : GS_WRONG_PENALTY);
    }
    return sum;
  }, 0);
  const scoreFormulaLabel =
    csatQuestionCount > 0 && gsQuestionCount > 0
      ? "GS +2/-0.66, CSAT +2.5/-0.83"
      : csatQuestionCount > 0
        ? "CSAT +2.5/-0.83"
        : "GS +2/-0.66";

  const filteredAnswers = attempt.answers.filter((a) => {
    if (filter === "wrong") return a.isCorrect === false;
    if (filter === "wrong_marked") return a.markedForReview && a.isCorrect === false;
    if (filter === "wrong_unmarked") return !a.markedForReview && a.isCorrect === false;
    if (filter === "marked") return a.markedForReview;
    return true;
  });

  const getScoreColor = () => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const orderedRunItems = (() => {
    if (!run) return [];
    if (!quizSet?.items?.length) return run.runItems;
    const order = new Map(quizSet.items.map((item, index) => [item.id, index]));
    return [...run.runItems].sort((a, b) => {
      const aIndex = order.get(a.quizSetItemId) ?? 0;
      const bIndex = order.get(b.quizSetItemId) ?? 0;
      return aIndex - bIndex;
    });
  })();

  const orderedQuizIds = orderedRunItems
    .map((item) => item.quizId)
    .filter(Boolean) as string[];
  const currentQuizIndex = orderedQuizIds.findIndex((id) => id === quizId);
  const nextQuizId =
    currentQuizIndex >= 0 ? orderedQuizIds[currentQuizIndex + 1] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Quiz Stats */}
      <QuizStats questions={attempt.answers} />

      {/* Score Summary */}
      <Card className="mb-6 mt-4">
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
              <p className="text-sm text-gray-500 mt-1">Correct</p>
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

          <div className="grid gap-3 sm:grid-cols-4 mb-6 text-left">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                Actual UPSC Score
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {formatUpscScore(upscScore)}
              </p>
              <p className="text-xs text-blue-700">{scoreFormulaLabel}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-red-700">
                Wrong
              </p>
              <p className="mt-1 text-2xl font-bold text-red-900">{wrongCount}</p>
              <p className="text-xs text-red-700">All incorrect answers</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Marked But Wrong
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{markedWrongCount}</p>
              <p className="text-xs text-amber-700">Reviewed and still incorrect</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-700">
                Unmarked Wrong
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{unmarkedWrongCount}</p>
              <p className="text-xs text-gray-600">
                Incorrect without review mark
                {unattemptedCount > 0 ? ` · ${unattemptedCount} unattempted` : ""}
              </p>
            </div>
          </div>

          {setId && runId && orderedQuizIds.length > 0 && currentQuizIndex >= 0 && (
            <p className="text-xs text-gray-400 mb-3">
              Quiz set progress: {currentQuizIndex + 1} of {orderedQuizIds.length}
            </p>
          )}

          <div className="flex items-center justify-center gap-4">
            <Link href={`/quiz/${quizId}`}>
              <Button variant="secondary">Retake Quiz</Button>
            </Link>
            {setId && runId && orderedQuizIds.length > 0 && currentQuizIndex >= 0 ? (
              nextQuizId ? (
                <Link href={`/quiz/${nextQuizId}?setId=${setId}&runId=${runId}`}>
                  <Button>Next Quiz</Button>
                </Link>
              ) : (
                <Link href={`/sets/${setId}/runs/${runId}/summary`}>
                  <Button>View Set Summary</Button>
                </Link>
              )
            ) : (
              <Link href="/quiz/new">
                <Button>New Quiz</Button>
              </Link>
            )}
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
          onClick={() => setFilter("wrong_marked")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            filter === "wrong_marked"
              ? "bg-amber-100 text-amber-700"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Marked But Wrong ({markedWrongCount})
        </button>
        <button
          onClick={() => setFilter("wrong_unmarked")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            filter === "wrong_unmarked"
              ? "bg-gray-200 text-gray-800"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Unmarked Wrong ({unmarkedWrongCount})
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
                  {answer.metadata?.category && (
                    <div className="mb-2">
                      <CategoryBadge category={answer.metadata.category} />
                    </div>
                  )}
                  <Markdown className="text-gray-900" text={answer.questionText} />
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
                      <span className={cn("text-sm", textColor)}>
                        <Markdown inline text={option} />
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Gemini Mismatch Warning */}
              {(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const meta: any = answer.metadata;
                if (typeof meta?.geminiPredictedOption === "number" && meta.upscCorrectOption !== meta.geminiPredictedOption) {
                  return (
                    <div className="mt-4 ml-11 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                      <span className="text-base leading-none mt-0.5">🤖</span>
                      <p>
                        <span className="font-semibold block mb-0.5">Gemini&apos;s Analysis Mismatch</span>
                        The official UPSC answer is <strong>Option {String.fromCharCode(65 + (correctOption ?? 0))}</strong>, but Gemini originally predicted <strong>Option {String.fromCharCode(65 + meta.geminiPredictedOption)}</strong>. The explanation below corresponds to its incorrect prediction.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Explanation */}
              {answer.explanation && (
                <div className="mt-4 ml-11 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Explanation
                  </p>
                  <Markdown className="text-sm text-blue-700" text={answer.explanation} />
                  
                  {/* Grounding Sources for Current Affairs questions */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta: any = answer.metadata;
                    return meta?.groundingSources && meta.groundingSources.length > 0 && (
                      <GroundingSourcesList sources={meta.groundingSources} />
                    );
                  })()}
                  
                  {/* Derived From Topic for trending topics */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const meta: any = answer.metadata;
                    return meta?.derivedFromTopic && (
                      <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                        <p className="text-xs text-purple-800">
                          📊 <span className="font-medium">Trending Topic:</span> {meta.derivedFromTopic}
                        </p>
                      </div>
                    );
                  })()}
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
              : filter === "wrong_marked"
                ? "No marked-but-wrong questions."
                : filter === "wrong_unmarked"
                  ? "No unmarked wrong questions."
                  : "No marked questions."}
          </p>
        </Card>
      )}
    </div>
  );
}

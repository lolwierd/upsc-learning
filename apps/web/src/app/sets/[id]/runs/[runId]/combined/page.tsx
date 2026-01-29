"use client";

export const runtime = "edge";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  getCombinedQuestions,
  startRunAttempt,
  getRunAttempt,
  saveRunAttemptAnswer,
  submitRunAttempt,
} from "@/lib/api";
import { SUBJECT_LABELS } from "@mcqs/shared";
import type { CombinedQuestion } from "@mcqs/shared";

interface Answer {
  questionId: string;
  selectedOption: number | null;
  markedForReview: boolean;
}

export default function CombinedQuizPage() {
  const params = useParams();
  const router = useRouter();
  const setId = params.id as string;
  const runId = params.runId as string;

  const [questions, setQuestions] = useState<CombinedQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [learnMode, setLearnMode] = useState(false);
  const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set());
  const [showAnswers, setShowAnswers] = useState(true);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load attempt on mount
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setAttemptId(null);
        setRevealedQuestions(new Set());

        const questionsData = await getCombinedQuestions(setId, runId);
        setQuestions(questionsData.questions);
        setLearnMode(questionsData.learnMode);

        if (questionsData.learnMode) {
          // Initialize empty answers
          const initialAnswers = new Map<string, Answer>();
          for (const q of questionsData.questions) {
            initialAnswers.set(q.id, {
              questionId: q.id,
              selectedOption: null,
              markedForReview: false,
            });
          }
          setAnswers(initialAnswers);
          setStartTime(Date.now());
          setLoading(false);
          return;
        }

        // Start or resume attempt (non-learn mode)
        const startResult = await startRunAttempt(setId, runId);

        // If already completed, redirect to results
        if (startResult.status === "completed") {
          router.replace(`/sets/${setId}/runs/${runId}/combined/results?attempt=${startResult.attemptId}`);
          return;
        }

        setAttemptId(startResult.attemptId);

        // If resuming, load existing answers
        if (startResult.message === "Resuming existing attempt") {
          const attemptData = await getRunAttempt(startResult.attemptId);
          setStartTime(attemptData.startedAt * 1000);

          // Restore answers
          const restoredAnswers = new Map<string, Answer>();
          for (const answer of attemptData.answers) {
            restoredAnswers.set(answer.questionId, {
              questionId: answer.questionId,
              selectedOption: answer.selectedOption,
              markedForReview: answer.markedForReview,
            });
          }
          setAnswers(restoredAnswers);
        } else {
          // Initialize empty answers
          const initialAnswers = new Map<string, Answer>();
          for (const q of questionsData.questions) {
            initialAnswers.set(q.id, {
              questionId: q.id,
              selectedOption: null,
              markedForReview: false,
            });
          }
          setAnswers(initialAnswers);
          setStartTime(Date.now());
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quiz");
        setLoading(false);
      }
    }
    load();
  }, [setId, runId, router]);

  // Handle answer selection
  const handleAnswer = useCallback(
    async (questionId: string, option: number) => {
      // In learn mode, just reveal the answer without saving to server
      if (learnMode) {
        const newAnswer: Answer = {
          questionId,
          selectedOption: option,
          markedForReview: false,
        };
        setAnswers((prev) => new Map(prev).set(questionId, newAnswer));
        setRevealedQuestions((prev) => new Set(prev).add(questionId));
        return;
      }

      if (!attemptId) return;

      const newAnswer: Answer = {
        questionId,
        selectedOption: option,
        markedForReview: answers.get(questionId)?.markedForReview || false,
      };

      setAnswers((prev) => new Map(prev).set(questionId, newAnswer));

      // Save to server
      try {
        await saveRunAttemptAnswer(attemptId, {
          questionId,
          selectedOption: option,
          markedForReview: newAnswer.markedForReview,
        });
      } catch (err) {
        console.error("Failed to save answer:", err);
      }
    },
    [attemptId, answers, learnMode]
  );

  // Handle mark for review
  const handleMarkForReview = useCallback(
    async (questionId: string) => {
      if (!attemptId || learnMode) return;

      const current = answers.get(questionId);
      const newAnswer: Answer = {
        questionId,
        selectedOption: current?.selectedOption ?? null,
        markedForReview: !current?.markedForReview,
      };

      setAnswers((prev) => new Map(prev).set(questionId, newAnswer));

      try {
        await saveRunAttemptAnswer(attemptId, {
          questionId,
          selectedOption: newAnswer.selectedOption,
          markedForReview: newAnswer.markedForReview,
        });
      } catch (err) {
        console.error("Failed to save review status:", err);
      }
    },
    [attemptId, answers, learnMode]
  );

  // Handle submit
  const handleSubmit = async () => {
    if (!attemptId) return;

    const unanswered = Array.from(answers.values()).filter(
      (a) => a.selectedOption === null
    ).length;

    if (unanswered > 0) {
      const confirm = window.confirm(
        `You have ${unanswered} unanswered question(s). Are you sure you want to submit?`
      );
      if (!confirm) return;
    }

    setSubmitting(true);
    try {
      await submitRunAttempt(attemptId);
      router.push(`/sets/${setId}/runs/${runId}/combined/results?attempt=${attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quiz");
      setSubmitting(false);
    }
  };

  const formatCopyText = (question: CombinedQuestion, index: number) => {
    const optionLines = question.options.map((option, optIndex) => {
      const label = String.fromCharCode(65 + optIndex);
      const cleaned = option.replace(/^[A-D]\)\s*/i, "");
      return `${label}) ${cleaned}`;
    });
    return `${index + 1}. ${question.questionText}\n${optionLines.join("\n")}`;
  };

  const handleCopyQuestion = async (question: CombinedQuestion, index: number) => {
    try {
      await navigator.clipboard.writeText(formatCopyText(question, index));
      setCopiedQuestionId(question.id);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedQuestionId(null), 1500);
    } catch (err) {
      console.error("Failed to copy question:", err);
    }
  };

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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Combined Quiz...</h2>
          <p className="text-gray-600">Shuffling questions from all quizzes in this run.</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4 font-medium">{error}</p>
          <Link href={`/sets/${setId}/runs/${runId}`}>
            <Button>Back to Run</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const answeredCount = Array.from(answers.values()).filter(
    (a) => a.selectedOption !== null
  ).length;
  const markedCount = Array.from(answers.values()).filter(
    (a) => a.markedForReview
  ).length;
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 lg:pb-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-gray-50 -mx-4 px-4 py-3 mb-6 border-b border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">
                Combined Quiz
              </h1>
              {learnMode && (
                <button
                  onClick={() => setShowAnswers(!showAnswers)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium transition-colors",
                    showAnswers
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {showAnswers ? "Hide Answers" : "Show Answers"}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {questions.length} questions from all quizzes in this run (shuffled)
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {!learnMode && (
              <span className="text-gray-600">
                {elapsedMinutes}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </span>
            )}
            <span className="text-gray-600">
              {answeredCount}/{questions.length} {learnMode ? "studied" : "answered"}
            </span>
            {!learnMode && markedCount > 0 && (
              <span className="text-amber-600">{markedCount} marked</span>
            )}
            {!learnMode && (
              <Button onClick={handleSubmit} loading={submitting} size="sm">
                Submit
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Navigation (Desktop) */}
        <div className="hidden lg:block">
          <Card className="sticky top-36">
            <p className="text-sm font-medium text-gray-700 mb-3">Questions</p>
            <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto">
              {questions.map((q, i) => {
                const answer = answers.get(q.id);
                const isAnswered = answer?.selectedOption !== null;
                const isMarked = answer?.markedForReview;
                const isRevealed = revealedQuestions.has(q.id);
                const isCorrect = learnMode && isRevealed && answer?.selectedOption === q.correctOption;
                const isIncorrect = learnMode && isRevealed && answer?.selectedOption !== q.correctOption;

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      document
                        .getElementById(`question-${i}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                      learnMode
                        ? isCorrect
                          ? "bg-green-100 text-green-700"
                          : isIncorrect
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        : isMarked
                          ? "bg-amber-100 text-amber-700"
                          : isAnswered
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                    title={`${SUBJECT_LABELS[q.subject as keyof typeof SUBJECT_LABELS]}${q.theme ? ` - ${q.theme}` : ""}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
              {learnMode ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-100 rounded" />
                    <span>Correct</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-100 rounded" />
                    <span>Incorrect</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-100 rounded" />
                    <span>Answered</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-100 rounded" />
                    <span>Marked for Review</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Questions */}
        <div className="lg:col-span-3 space-y-6">
          {questions.map((question, i) => {
            const answer = answers.get(question.id);
            const isMarked = answer?.markedForReview;
            const isRevealed = revealedQuestions.has(question.id);
            const selectedOption = answer?.selectedOption;
            const isCorrectAnswer = selectedOption === question.correctOption;

            return (
              <Card
                key={question.id}
                id={`question-${i}`}
                className={cn(
                  "scroll-mt-36",
                  !learnMode && isMarked && "ring-2 ring-amber-400"
                )}
              >
                {/* Subject/Theme Badge */}
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                    {SUBJECT_LABELS[question.subject as keyof typeof SUBJECT_LABELS]}
                  </span>
                  {question.theme && (
                    <span className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded-full">
                      {question.theme}
                    </span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-medium text-sm">
                      {i + 1}
                    </span>
                    <p className="text-gray-900 whitespace-pre-wrap">
                      {question.questionText}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyQuestion(question, i)}
                      className={cn(
                        "flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        copiedQuestionId === question.id
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                      title="Copy question and options"
                    >
                      {copiedQuestionId === question.id ? "Copied" : "Copy"}
                    </button>
                    {!learnMode && (
                      <button
                        onClick={() => handleMarkForReview(question.id)}
                        className={cn(
                          "flex-shrink-0 p-2 rounded-lg transition-colors",
                          isMarked
                            ? "bg-amber-100 text-amber-700"
                            : "text-gray-400 hover:bg-gray-100"
                        )}
                        title={isMarked ? "Unmark" : "Mark for Review"}
                      >
                        <svg
                          className="w-5 h-5"
                          fill={isMarked ? "currentColor" : "none"}
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 ml-11">
                  {question.options.map((option, optIndex) => {
                    const isSelected = selectedOption === optIndex;
                    const optionLabel = String.fromCharCode(65 + optIndex);
                    const isCorrectOption = optIndex === question.correctOption;
                    const showCorrect = learnMode && isRevealed && isCorrectOption;
                    const showIncorrect = learnMode && isRevealed && isSelected && !isCorrectOption;

                    return (
                      <button
                        key={optIndex}
                        onClick={() => {
                          if (isRevealed) return;
                          handleAnswer(question.id, optIndex);
                        }}
                        disabled={learnMode && isRevealed}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3",
                          learnMode && isRevealed
                            ? showCorrect
                              ? "border-green-500 bg-green-50"
                              : showIncorrect
                                ? "border-red-500 bg-red-50"
                                : isSelected
                                  ? "border-gray-300 bg-gray-50"
                                  : "border-gray-200"
                            : isSelected
                              ? "border-primary-500 bg-primary-50"
                              : "border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <span
                          className={cn(
                            "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                            learnMode && isRevealed
                              ? showCorrect
                                ? "border-green-500 bg-green-500 text-white"
                                : showIncorrect
                                  ? "border-red-500 bg-red-500 text-white"
                                  : isSelected
                                    ? "border-gray-400 bg-gray-400 text-white"
                                    : "border-gray-300 text-gray-500"
                              : isSelected
                                ? "border-primary-500 bg-primary-500 text-white"
                                : "border-gray-300 text-gray-500"
                          )}
                        >
                          {optionLabel}
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            learnMode && isRevealed
                              ? showCorrect
                                ? "text-green-700"
                                : showIncorrect
                                  ? "text-red-700"
                                  : "text-gray-700"
                              : isSelected
                                ? "text-primary-700"
                                : "text-gray-700"
                          )}
                        >
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Learn Mode: Answer Section */}
                {learnMode && showAnswers && (
                  <div
                    className={cn(
                      "mt-4 ml-11 space-y-3 transition-all duration-200",
                      i < 2 && !isRevealed && "blur-sm hover:blur-none select-none hover:select-auto"
                    )}
                  >
                    {/* Feedback after clicking */}
                    {isRevealed && (
                      <div
                        className={cn(
                          "flex items-center gap-2 text-sm font-medium",
                          isCorrectAnswer ? "text-green-700" : "text-red-700"
                        )}
                      >
                        {isCorrectAnswer ? (
                          <>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>Correct!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span>Incorrect!</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Correct Answer */}
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>Correct Answer: {String.fromCharCode(65 + (question.correctOption ?? 0))}</span>
                    </div>

                    {/* Explanation */}
                    {question.explanation && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-900 mb-1">Explanation</p>
                        <p className="text-sm text-blue-800 whitespace-pre-wrap">{question.explanation}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Submit Button / Learn Mode Actions */}
          <Card className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {answeredCount}/{questions.length} questions {learnMode ? "studied" : "answered"}
            </p>
            {learnMode ? (
              <Link href={`/sets/${setId}/runs/${runId}`}>
                <Button size="lg">Back to Run</Button>
              </Link>
            ) : (
              <Button onClick={handleSubmit} loading={submitting} size="lg">
                Submit Quiz
              </Button>
            )}
          </Card>
        </div>
      </div>

      {/* Mobile Progress Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-sm text-gray-600">
            {answeredCount}/{questions.length} {learnMode ? "studied" : "answered"}
          </span>
          {!learnMode && (
            <Button onClick={handleSubmit} loading={submitting} size="sm">
              Submit
            </Button>
          )}
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

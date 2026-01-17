"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getQuiz, startAttempt, saveAnswer, submitAttempt } from "@/lib/api";
import type { QuestionForQuiz } from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS, QUESTION_STYLE_LABELS } from "@mcqs/shared";

interface QuizData {
  id: string;
  subject: string;
  theme?: string;
  difficulty: string;
  style: string;
  questionCount: number;
  questions: QuestionForQuiz[];
}

interface Answer {
  questionId: string;
  selectedOption: number | null;
  markedForReview: boolean;
}

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map());
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

  // Load quiz and start attempt
  useEffect(() => {
    async function load() {
      try {
        const quizData = await getQuiz(quizId);
        setQuiz(quizData as unknown as QuizData);

        // Initialize answers
        const initialAnswers = new Map<string, Answer>();
        quizData.questions.forEach((q) => {
          initialAnswers.set(q.id, {
            questionId: q.id,
            selectedOption: null,
            markedForReview: false,
          });
        });
        setAnswers(initialAnswers);

        // Start attempt
        const { attemptId: id } = await startAttempt(quizId);
        setAttemptId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [quizId]);

  // Handle answer selection
  const handleAnswer = useCallback(
    async (questionId: string, option: number) => {
      if (!attemptId) return;

      const newAnswer: Answer = {
        questionId,
        selectedOption: option,
        markedForReview: answers.get(questionId)?.markedForReview || false,
      };

      setAnswers((prev) => new Map(prev).set(questionId, newAnswer));

      // Save to server
      try {
        await saveAnswer(attemptId, {
          questionId,
          selectedOption: option,
          markedForReview: newAnswer.markedForReview,
        });
      } catch (err) {
        console.error("Failed to save answer:", err);
      }
    },
    [attemptId, answers]
  );

  // Handle mark for review
  const handleMarkForReview = useCallback(
    async (questionId: string) => {
      if (!attemptId) return;

      const current = answers.get(questionId);
      const newAnswer: Answer = {
        questionId,
        selectedOption: current?.selectedOption ?? null,
        markedForReview: !current?.markedForReview,
      };

      setAnswers((prev) => new Map(prev).set(questionId, newAnswer));

      try {
        await saveAnswer(attemptId, {
          questionId,
          selectedOption: newAnswer.selectedOption,
          markedForReview: newAnswer.markedForReview,
        });
      } catch (err) {
        console.error("Failed to save review status:", err);
      }
    },
    [attemptId, answers]
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
      await submitAttempt(attemptId);
      router.push(`/quiz/${quizId}/results?attempt=${attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quiz");
      setSubmitting(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!quiz) return;

      // Number keys 1-4 for options
      if (["1", "2", "3", "4"].includes(e.key)) {
        const question = quiz.questions[currentQuestion];
        handleAnswer(question.id, parseInt(e.key) - 1);
        return;
      }

      // M for mark for review
      if (e.key.toLowerCase() === "m") {
        const question = quiz.questions[currentQuestion];
        handleMarkForReview(question.id);
        return;
      }

      // N or Right arrow for next
      if (e.key.toLowerCase() === "n" || e.key === "ArrowRight") {
        if (currentQuestion < quiz.questions.length - 1) {
          setCurrentQuestion((prev) => prev + 1);
        }
        return;
      }

      // P or Left arrow for previous
      if (e.key.toLowerCase() === "p" || e.key === "ArrowLeft") {
        if (currentQuestion > 0) {
          setCurrentQuestion((prev) => prev - 1);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quiz, currentQuestion, handleAnswer, handleMarkForReview]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading quiz...</p>
        </Card>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error || "Quiz not found"}</p>
          <Button onClick={() => router.push("/")}>Go to Dashboard</Button>
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
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
            {quiz.theme && ` - ${quiz.theme}`}
          </h1>
          <p className="text-sm text-gray-500">
            {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]} •{" "}
            {QUESTION_STYLE_LABELS[quiz.style as keyof typeof QUESTION_STYLE_LABELS]}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            {elapsedMinutes}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </span>
          <span className="text-gray-600">
            {answeredCount}/{quiz.questionCount} answered
          </span>
          {markedCount > 0 && (
            <span className="text-amber-600">{markedCount} marked</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Navigation (Desktop) */}
        <div className="hidden lg:block">
          <Card className="sticky top-24">
            <p className="text-sm font-medium text-gray-700 mb-3">Questions</p>
            <div className="grid grid-cols-5 gap-2">
              {quiz.questions.map((q, i) => {
                const answer = answers.get(q.id);
                const isAnswered = answer?.selectedOption !== null;
                const isMarked = answer?.markedForReview;
                const isCurrent = i === currentQuestion;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestion(i)}
                    className={cn(
                      "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                      isCurrent && "ring-2 ring-primary-500",
                      isMarked
                        ? "bg-amber-100 text-amber-700"
                        : isAnswered
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-100 rounded" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-amber-100 rounded" />
                <span>Marked for Review</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Questions */}
        <div className="lg:col-span-3 space-y-6">
          {quiz.questions.map((question, i) => {
            const answer = answers.get(question.id);
            const isMarked = answer?.markedForReview;

            return (
              <Card
                key={question.id}
                id={`question-${i}`}
                className={cn(
                  "scroll-mt-24",
                  isMarked && "ring-2 ring-amber-400"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-medium text-sm">
                      {i + 1}
                    </span>
                    <p className="text-gray-900 whitespace-pre-wrap">
                      {question.questionText}
                    </p>
                  </div>
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
                </div>

                <div className="space-y-2 ml-11">
                  {question.options.map((option, optIndex) => {
                    const isSelected = answer?.selectedOption === optIndex;
                    const optionLabel = String.fromCharCode(65 + optIndex);

                    return (
                      <button
                        key={optIndex}
                        onClick={() => handleAnswer(question.id, optIndex)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3",
                          isSelected
                            ? "border-primary-500 bg-primary-50"
                            : "border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        <span
                          className={cn(
                            "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                            isSelected
                              ? "border-primary-500 bg-primary-500 text-white"
                              : "border-gray-300 text-gray-500"
                          )}
                        >
                          {optionLabel}
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            isSelected ? "text-primary-700" : "text-gray-700"
                          )}
                        >
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}

          {/* Submit Button */}
          <Card className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {answeredCount}/{quiz.questionCount} questions answered
            </p>
            <Button onClick={handleSubmit} loading={submitting} size="lg">
              Submit Quiz
            </Button>
          </Card>
        </div>
      </div>

      {/* Mobile Question Navigation */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
            disabled={currentQuestion === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            {currentQuestion + 1} / {quiz.questionCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setCurrentQuestion(
                Math.min(quiz.questionCount - 1, currentQuestion + 1)
              )
            }
            disabled={currentQuestion === quiz.questionCount - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

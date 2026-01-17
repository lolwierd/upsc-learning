"use client";

export const runtime = "edge";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getQuiz, getSettings, startAttempt, saveAnswer, submitAttempt } from "@/lib/api";
import { SUBJECT_LABELS, DIFFICULTY_LABELS, QUESTION_STYLE_LABELS } from "@mcqs/shared";

interface LearnModeQuestion {
  id: string;
  sequenceNumber: number;
  questionText: string;
  questionType: string;
  options: string[];
  explanation?: string;
  metadata?: Record<string, unknown> | null;
  correctOption?: number;
}

interface QuizData {
  id: string;
  subject: string;
  theme?: string;
  difficulty: string;
  style: string;
  questionCount: number;
  questions: LearnModeQuestion[];
  learnMode?: boolean;
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
  const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set());

  // Load quiz and start attempt
  useEffect(() => {
    async function load() {
      try {
        // Check if learn mode is enabled
        const settings = await getSettings();
        const isLearnMode = settings.learnModeEnabled;

        // Fetch quiz (with answers if learn mode)
        const quizData = await getQuiz(quizId, { withAnswers: isLearnMode });
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

        // Only start attempt if not in learn mode
        if (!quizData.learnMode) {
          const { attemptId: id } = await startAttempt(quizId);
          setAttemptId(id);
        }
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
      // In learn mode, just reveal the answer without saving to server
      if (quiz?.learnMode) {
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
        await saveAnswer(attemptId, {
          questionId,
          selectedOption: option,
          markedForReview: newAnswer.markedForReview,
        });
      } catch (err) {
        console.error("Failed to save answer:", err);
      }
    },
    [attemptId, answers, quiz?.learnMode]
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">
              {SUBJECT_LABELS[quiz.subject as keyof typeof SUBJECT_LABELS]}
              {quiz.theme && ` - ${quiz.theme}`}
            </h1>
            {quiz.learnMode && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                Learn Mode
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {DIFFICULTY_LABELS[quiz.difficulty as keyof typeof DIFFICULTY_LABELS]} •{" "}
            {QUESTION_STYLE_LABELS[quiz.style as keyof typeof QUESTION_STYLE_LABELS]}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {!quiz.learnMode && (
            <span className="text-gray-600">
              {elapsedMinutes}:{String(elapsedSeconds % 60).padStart(2, "0")}
            </span>
          )}
          <span className="text-gray-600">
            {answeredCount}/{quiz.questionCount} {quiz.learnMode ? "studied" : "answered"}
          </span>
          {!quiz.learnMode && markedCount > 0 && (
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
                const isRevealed = revealedQuestions.has(q.id);
                const isCorrect = quiz.learnMode && isRevealed && answer?.selectedOption === q.correctOption;
                const isIncorrect = quiz.learnMode && isRevealed && answer?.selectedOption !== q.correctOption;

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentQuestion(i);
                      document
                        .getElementById(`question-${i}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                      isCurrent && "ring-2 ring-primary-500",
                      quiz.learnMode
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
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-gray-500">
              {quiz.learnMode ? (
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
          {quiz.questions.map((question, i) => {
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
                  "scroll-mt-24",
                  !quiz.learnMode && isMarked && "ring-2 ring-amber-400"
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
                  {!quiz.learnMode && (
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

                <div className="space-y-2 ml-11">
                  {question.options.map((option, optIndex) => {
                    const isSelected = selectedOption === optIndex;
                    const optionLabel = String.fromCharCode(65 + optIndex);
                    const isCorrectOption = optIndex === question.correctOption;
                    const showCorrect = quiz.learnMode && isRevealed && isCorrectOption;
                    const showIncorrect = quiz.learnMode && isRevealed && isSelected && !isCorrectOption;

                    return (
                      <button
                        key={optIndex}
                        onClick={() => !isRevealed && handleAnswer(question.id, optIndex)}
                        disabled={quiz.learnMode && isRevealed}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3",
                          quiz.learnMode && isRevealed
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
                            quiz.learnMode && isRevealed
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
                            quiz.learnMode && isRevealed
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

                {/* Learn Mode: Answer Reveal Section */}
                {quiz.learnMode && isRevealed && (
                  <div className="mt-4 ml-11 space-y-3">
                    {/* Correct/Incorrect feedback */}
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
                          <span>Incorrect - The correct answer is {String.fromCharCode(65 + (question.correctOption ?? 0))}</span>
                        </>
                      )}
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
              {answeredCount}/{quiz.questionCount} questions {quiz.learnMode ? "studied" : "answered"}
            </p>
            {quiz.learnMode ? (
              <Button onClick={() => router.push("/")} size="lg">
                Start New Quiz
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={submitting} size="lg">
                Submit Quiz
              </Button>
            )}
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
          <div className="text-center">
            <span className="text-sm text-gray-600">
              {currentQuestion + 1} / {quiz.questionCount}
            </span>
            {quiz.learnMode && (
              <span className="block text-xs text-blue-600">
                {answeredCount} studied
              </span>
            )}
          </div>
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

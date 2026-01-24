"use client";

export const runtime = "edge";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardTitle, Button } from "@/components/ui";
import { getAttemptsByQuizIds, getQuizSet, getQuizSetRun } from "@/lib/api";
import type {
  QuizAttemptSummary,
  QuizSetRunWithItems,
  QuizSetWithSchedule,
} from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS } from "@mcqs/shared";
import { cn } from "@/lib/utils";

function orderRunItems(
  run: QuizSetRunWithItems,
  quizSet: QuizSetWithSchedule | null
) {
  if (!quizSet?.items?.length) return run.runItems;
  const order = new Map(quizSet.items.map((item, index) => [item.id, index]));
  return [...run.runItems].sort((a, b) => {
    const aIndex = order.get(a.quizSetItemId) ?? 0;
    const bIndex = order.get(b.quizSetItemId) ?? 0;
    return aIndex - bIndex;
  });
}

export default function QuizSetRunSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const setId = params.id as string;
  const runId = params.runId as string;

  const [run, setRun] = useState<QuizSetRunWithItems | null>(null);
  const [quizSet, setQuizSet] = useState<QuizSetWithSchedule | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [runResult, setResult] = await Promise.allSettled([
      getQuizSetRun(setId, runId),
      getQuizSet(setId),
    ]);

    if (runResult.status === "fulfilled") {
      setRun(runResult.value);
    } else {
      setError(runResult.reason instanceof Error ? runResult.reason.message : "Failed to load run");
    }

    if (setResult.status === "fulfilled") {
      setQuizSet(setResult.value);
    }

    setLoading(false);
  }, [setId, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedRunItems = useMemo(() => {
    if (!run) return [];
    return orderRunItems(run, quizSet);
  }, [run, quizSet]);

  const quizIds = useMemo(
    () => orderedRunItems.map((item) => item.quizId).filter(Boolean) as string[],
    [orderedRunItems]
  );

  useEffect(() => {
    if (quizIds.length === 0) {
      setAttempts([]);
      return;
    }
    void getAttemptsByQuizIds(quizIds)
      .then((data) => setAttempts(data.attempts))
      .catch((err) =>
        console.error("Failed to load attempts for quiz set run:", err)
      );
  }, [quizIds]);

  const attemptMap = useMemo(() => {
    return new Map(attempts.map((attempt) => [attempt.quizId, attempt]));
  }, [attempts]);

  const totals = useMemo(() => {
    const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const totalQuestions = attempts.reduce(
      (sum, attempt) => sum + attempt.totalQuestions,
      0
    );
    const totalTime = attempts.reduce(
      (sum, attempt) => sum + (attempt.timeTakenSeconds || 0),
      0
    );
    return { totalScore, totalQuestions, totalTime };
  }, [attempts]);

  const nextQuizId = useMemo(() => {
    for (const quizId of quizIds) {
      if (!attemptMap.has(quizId)) return quizId;
    }
    return null;
  }, [attemptMap, quizIds]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading summary...</p>
        </Card>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error || "Run not found"}</p>
          <Link href={`/sets/${setId}/runs/${runId}`}>
            <Button>Back to Run</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle className="mb-2">Quiz Set Summary</CardTitle>
          <p className="text-sm text-gray-600">
            {quizSet?.name ? `${quizSet.name} · ` : ""}Run {run.id}
          </p>
        </div>
        <Link href={`/sets/${setId}/runs/${runId}`}>
          <Button variant="secondary">Back to Run</Button>
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-500">Aggregate Score</p>
            <p className="text-2xl font-semibold text-gray-900">
              {totals.totalScore}/{totals.totalQuestions || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Accuracy</p>
            <p className="text-2xl font-semibold text-gray-900">
              {totals.totalQuestions > 0
                ? Math.round((totals.totalScore / totals.totalQuestions) * 100)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Time</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatTime(totals.totalTime)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                router.push(
                  nextQuizId
                    ? `/quiz/${nextQuizId}?setId=${setId}&runId=${runId}`
                    : `/sets/${setId}/runs/${runId}/attempt`
                )
              }
            >
              {nextQuizId ? "Continue Attempt" : "Review Run"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="text-base mb-4">Per-Quiz Scores</CardTitle>
        <div className="space-y-2">
          {orderedRunItems.map((item, index) => {
            const quizSetItem = quizSet?.items?.find((q) => q.id === item.quizSetItemId);
            const attempt = item.quizId ? attemptMap.get(item.quizId) : undefined;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">{index + 1}.</span>
                    <span className="font-medium text-gray-900">
                      {quizSetItem
                        ? SUBJECT_LABELS[quizSetItem.subject as keyof typeof SUBJECT_LABELS]
                        : item.quizSetItemId}
                    </span>
                    {quizSetItem?.theme && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-500 truncate">
                          {quizSetItem.theme}
                        </span>
                      </>
                    )}
                  </div>
                  {quizSetItem && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {DIFFICULTY_LABELS[quizSetItem.difficulty as keyof typeof DIFFICULTY_LABELS]} ·{" "}
                      {quizSetItem.questionCount} questions
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full capitalize",
                      item.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : item.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {item.status}
                  </span>
                  {item.quizId ? (
                    attempt ? (
                      <span className="text-xs text-gray-700">
                        {attempt.score}/{attempt.totalQuestions} ·{" "}
                        {formatTime(attempt.timeTakenSeconds || 0)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not attempted</span>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">No quiz</span>
                  )}
                  {item.quizId && (
                    <Link href={`/quiz/${item.quizId}?setId=${setId}&runId=${runId}`}>
                      <Button size="sm" variant="secondary">Open Quiz</Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

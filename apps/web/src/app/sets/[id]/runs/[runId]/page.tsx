"use client";

export const runtime = "edge";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardTitle, Button } from "@/components/ui";
import { getQuizSet, getQuizSetRun } from "@/lib/api";
import type { QuizSetRunWithItems, QuizSetWithSchedule } from "@mcqs/shared";
import { SUBJECT_LABELS } from "@mcqs/shared";
import { cn } from "@/lib/utils";

export default function QuizSetRunPage() {
  const params = useParams();
  const setId = params.id as string;
  const runId = params.runId as string;

  const [quizSet, setQuizSet] = useState<QuizSetWithSchedule | null>(null);
  const [run, setRun] = useState<QuizSetRunWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemMap = useMemo(() => {
    if (!quizSet?.items) return new Map();
    return new Map(quizSet.items.map((item) => [item.id, item]));
  }, [quizSet]);

  const orderedRunItems = useMemo(() => {
    if (!run) return [];
    if (!quizSet?.items?.length) return run.runItems;
    const order = new Map(quizSet.items.map((item, index) => [item.id, index]));
    return [...run.runItems].sort((a, b) => {
      const aIndex = order.get(a.quizSetItemId) ?? 0;
      const bIndex = order.get(b.quizSetItemId) ?? 0;
      return aIndex - bIndex;
    });
  }, [run, quizSet]);

  const canAttemptRun = useMemo(() => {
    if (!run) return false;
    if (run.runItems.length === 0) return false;
    const allDone = run.runItems.every(
      (item) => item.status === "completed" || item.status === "failed"
    );
    const hasQuiz = run.runItems.some((item) => item.quizId);
    return allDone && hasQuiz;
  }, [run]);

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

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading run...</p>
        </Card>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error || "Run not found"}</p>
          <Link href={`/sets/${setId}`}>
            <Button>Back to Quiz Set</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle className="mb-2">Run Details</CardTitle>
          <p className="text-sm text-gray-600">
            {quizSet?.name ? `${quizSet.name} · ` : ""}Run {run.id}
          </p>
        </div>
        <Link href={`/sets/${setId}`}>
          <Button variant="secondary">Back to Quiz Set</Button>
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  run.status === "completed"
                    ? "bg-green-500"
                    : run.status === "running"
                      ? "bg-amber-500 animate-pulse"
                      : run.status === "partial"
                        ? "bg-amber-500"
                        : "bg-red-500"
                )}
              />
              <span className="font-medium text-gray-900 capitalize">{run.status}</span>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {run.triggerType === "scheduled" ? "Scheduled" : "Manual"} ·{" "}
            {run.totalItems} items
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
          <div>
            <p className="text-gray-500">Started</p>
            <p className="font-medium text-gray-900">{formatDateTime(run.startedAt)}</p>
          </div>
          <div>
            <p className="text-gray-500">Completed</p>
            <p className="font-medium text-gray-900">
              {run.completedAt ? formatDateTime(run.completedAt) : "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Progress</p>
            <p className="font-medium text-gray-900">
              {run.completedItems}/{run.totalItems} completed
              {run.failedItems > 0 ? ` · ${run.failedItems} failed` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {canAttemptRun ? (
            <>
              <Link href={`/sets/${setId}/runs/${runId}/attempt`}>
                <Button>Attempt Run</Button>
              </Link>
              <Link href={`/sets/${setId}/runs/${runId}/combined`}>
                <Button variant="secondary">Combined Quiz (Jumbled)</Button>
              </Link>
            </>
          ) : (
            <>
              <Button disabled>Attempt Run</Button>
              <Button variant="secondary" disabled>Combined Quiz (Jumbled)</Button>
            </>
          )}
          <Link href={`/sets/${setId}/runs/${runId}/summary`}>
            <Button variant="secondary">View Summary</Button>
          </Link>
        </div>

        {run.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {run.error}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="text-base mb-4">Run Items</CardTitle>
        <div className="space-y-2">
          {orderedRunItems.map((item, index) => {
            const quizSetItem = itemMap.get(item.quizSetItemId);
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
                        : item.status === "generating"
                          ? "bg-amber-100 text-amber-700"
                          : item.status === "pending"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-red-100 text-red-700"
                    )}
                  >
                    {item.status}
                  </span>
                  {item.quizId && (
                    <Link href={`/quiz/${item.quizId}?setId=${setId}&runId=${runId}`}>
                      <Button size="sm">Open Quiz</Button>
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

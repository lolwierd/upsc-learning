"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getAiMetrics, type AiGenerationMetric, type AiMetricStatus } from "@/lib/api";
import { SUBJECTS, SUBJECT_LABELS } from "@mcqs/shared";

function formatDateTime(timestampSeconds: number) {
  const date = new Date(timestampSeconds * 1000);
  const dateStr = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateStr} · ${timeStr}`;
}

function formatMs(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function subjectLabel(subject: string) {
  return (
    SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ??
    subject.replaceAll("_", " ")
  );
}

function statusBadge(status: AiMetricStatus) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        status === "success"
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      )}
    >
      {status}
    </span>
  );
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<AiGenerationMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<AiMetricStatus | null>(null);
  const [limit, setLimit] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo(
    () => ({
      limit,
      subject: selectedSubject ?? undefined,
      status: selectedStatus ?? undefined,
    }),
    [limit, selectedSubject, selectedStatus]
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAiMetrics(filters);
        setMetrics(data.metrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filters, reloadKey]);

  const summary = useMemo(() => {
    const total = metrics.length;
    const success = metrics.filter((m) => m.status === "success").length;
    const errorCount = total - success;
    const genDurations = metrics
      .map((m) => m.generationDurationMs)
      .filter((n): n is number => typeof n === "number");
    const avgGenMs =
      genDurations.length === 0
        ? null
        : Math.round(genDurations.reduce((a, b) => a + b, 0) / genDurations.length);
    return { total, success, errorCount, avgGenMs };
  }, [metrics]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <CardTitle>AI Metrics</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Debug generation quality (validation, dedup, parsing, timings).
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setReloadKey((v) => v + 1);
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-5">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-semibold text-gray-900 tabular-nums">
            {summary.total}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-gray-500">Success</div>
          <div className="text-2xl font-semibold text-green-700 tabular-nums">
            {summary.success}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-gray-500">Errors</div>
          <div className="text-2xl font-semibold text-red-700 tabular-nums">
            {summary.errorCount}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-gray-500">Avg generation</div>
          <div className="text-2xl font-semibold text-gray-900 tabular-nums">
            {summary.avgGenMs === null ? "—" : formatMs(summary.avgGenMs)}
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Limit, subject, and status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSubject(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                selectedSubject === null
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All subjects
            </button>
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSubject(s)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                  selectedSubject === s
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {SUBJECT_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 mr-1">Status:</span>
            <button
              onClick={() => setSelectedStatus(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                selectedStatus === null
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStatus("success")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                selectedStatus === "success"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              Success
            </button>
            <button
              onClick={() => setSelectedStatus("error")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                selectedStatus === "error"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              Error
            </button>

            <span className="text-sm text-gray-500 ml-3">Limit:</span>
            {[20, 50, 100, 200].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium transition-colors tabular-nums",
                  limit === n
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading metrics...</p>
        </Card>
      ) : error ? (
        <Card className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-500 mt-2">
            If this is a fresh setup, run the D1 migrations first.
          </p>
        </Card>
      ) : metrics.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">No metrics yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Generate a quiz, then come back here.
          </p>
          <div className="mt-4">
            <Link href="/quiz/new">
              <Button>Create Quiz</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {metrics.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-gray-900">
                      {subjectLabel(m.subject)}
                    </div>
                    {m.theme && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-500 truncate">
                          {m.theme}
                        </span>
                      </>
                    )}
                    <span className="text-gray-300">·</span>
                    <span className="text-[13px] text-gray-400">
                      {formatDateTime(m.createdAt)}
                    </span>
                    <span className="text-gray-300">·</span>
                    {statusBadge(m.status)}
                  </div>

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                    <div className="text-gray-600">
                      <span className="text-gray-400">Count:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {m.returnedCount}/{m.requestedCount}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-400">Validation:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {m.validationInvalidCount ?? "—"} invalid
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-400">Warnings:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {m.validationWarningCount ?? "—"}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-400">Dedup:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {m.dedupFilteredCount}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-400">Gen:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {formatMs(m.generationDurationMs)}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      <span className="text-gray-400">Total:</span>{" "}
                      <span className="font-medium tabular-nums">
                        {formatMs(m.totalDurationMs)}
                      </span>
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="text-sm text-primary-700 hover:text-primary-800 cursor-pointer select-none">
                      Details
                    </summary>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                      <div>
                        <div>
                          <span className="text-gray-400">Model:</span>{" "}
                          <span className="font-medium">{m.model}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Fact-check model:</span>{" "}
                          <span className="font-medium">
                            {m.factCheckEnabled ? (m.factCheckModel ?? "—") : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Parse:</span>{" "}
                          <span className="font-medium">
                            {m.parseStrategy ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Prompt chars:</span>{" "}
                          <span className="font-medium tabular-nums">
                            {m.promptChars ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Response chars:</span>{" "}
                          <span className="font-medium tabular-nums">
                            {m.responseChars ?? "—"}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div>
                          <span className="text-gray-400">Fact-check:</span>{" "}
                          <span className="font-medium">
                            {m.factCheckEnabled ? "enabled" : "disabled"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Fact-check time:</span>{" "}
                          <span className="font-medium tabular-nums">
                            {formatMs(m.factCheckDurationMs)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">Token usage:</span>{" "}
                          <span className="font-medium tabular-nums">
                            {m.usageTotalTokens ?? "—"}
                          </span>
                        </div>
                        {m.status === "error" && m.errorMessage && (
                          <div className="mt-2 text-red-700">
                            <span className="text-red-400">Error:</span>{" "}
                            {m.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>

                <div className="flex-shrink-0">
                  {m.quizId ? (
                    <Link href={`/quiz/${m.quizId}`}>
                      <Button size="sm" variant="secondary">
                        Open Quiz
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">No quiz</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

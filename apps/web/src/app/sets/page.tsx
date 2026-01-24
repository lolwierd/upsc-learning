"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getQuizSets, generateQuizSet, deleteQuizSet } from "@/lib/api";
import type { QuizSetListItem } from "@mcqs/shared";

export default function QuizSetsPage() {
  const [sets, setSets] = useState<QuizSetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingSetId, setGeneratingSetId] = useState<string | null>(null);

  useEffect(() => {
    loadSets();
  }, []);

  async function loadSets() {
    setLoading(true);
    try {
      const data = await getQuizSets();
      setSets(data.sets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quiz sets");
    } finally {
      setLoading(false);
    }
  }

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatNextRun = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
    } else if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes > 0) {
        return `in ${diffMinutes} min`;
      }
      return "soon";
    }
  };

  const handleGenerate = async (setId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setGeneratingSetId(setId);
    try {
      await generateQuizSet(setId);
      await loadSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setGeneratingSetId(null);
    }
  };

  const handleDelete = async (setId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this quiz set?")) {
      return;
    }

    try {
      await deleteQuizSet(setId);
      await loadSets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quiz set");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <CardTitle>Quiz Sets</CardTitle>
        <Link href="/sets/new">
          <Button>Create New Set</Button>
        </Link>
      </div>

      {loading ? (
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading quiz sets...</p>
        </Card>
      ) : error ? (
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => { setError(null); loadSets(); }}>Retry</Button>
        </Card>
      ) : sets.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">
            No quiz sets yet. Create your first set to get started.
          </p>
          <Link href="/sets/new">
            <Button>Create Your First Set</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {sets.map((set) => (
            <Link key={set.id} href={`/sets/${set.id}`} className="block">
              <Card className="p-5 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] transition-shadow cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  {/* Left side: Info */}
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{set.name}</h3>
                      {!set.isActive && (
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {set.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                        {set.description}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <span>{set.itemCount} quiz{set.itemCount !== 1 ? "zes" : ""}</span>
                      <span className="text-gray-300">·</span>
                      <span>Created {formatDateTime(set.createdAt)}</span>
                    </div>

                    {/* Schedule info */}
                    {set.schedule && (
                      <div className="flex items-center gap-2 mt-2">
                        {set.schedule.isEnabled ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="text-xs text-green-600 font-medium">
                              Scheduled
                              {set.schedule.nextRunAt && ` · Next run ${formatNextRun(set.schedule.nextRunAt)}`}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                            <span className="text-xs text-gray-400">Schedule paused</span>
                          </>
                        )}
                        {set.schedule.lastRunStatus && (
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded",
                              set.schedule.lastRunStatus === "completed"
                                ? "bg-green-50 text-green-600"
                                : set.schedule.lastRunStatus === "partial"
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-red-50 text-red-600"
                            )}
                          >
                            Last: {set.schedule.lastRunStatus}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right side: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => handleGenerate(set.id, e)}
                      disabled={generatingSetId === set.id || set.itemCount === 0}
                    >
                      {generatingSetId === set.id ? "Starting..." : "Generate"}
                    </Button>
                    <button
                      onClick={(e) => handleDelete(set.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete set"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

export const runtime = "edge";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, Input, Button } from "@/components/ui";
import { QuizItemForm } from "@/components/quiz-sets/QuizItemForm";
import { ScheduleBuilder } from "@/components/quiz-sets/ScheduleBuilder";
import { ItemReorderList } from "@/components/quiz-sets/ItemReorderList";
import {
  getQuizSet,
  updateQuizSet,
  addQuizSetItem,
  updateQuizSetItem,
  deleteQuizSetItem,
  reorderQuizSetItems,
  generateQuizSet,
  getQuizSetRuns,
  setQuizSetSchedule,
  deleteQuizSetSchedule,
  toggleQuizSetSchedule,
} from "@/lib/api";
import type {
  QuizSetWithSchedule,
  QuizSetItem,
  QuizSetRun,
  QuizSetItemConfig,
} from "@mcqs/shared";
import { cn } from "@/lib/utils";



export default function QuizSetDetailPage() {
  const params = useParams();
  const setId = params.id as string;

  const [quizSet, setQuizSet] = useState<QuizSetWithSchedule | null>(null);
  const [runs, setRuns] = useState<QuizSetRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<QuizSetItem | null>(null);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);

  // Action states
  const [generating, setGenerating] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const loadQuizSet = useCallback(async () => {
    try {
      const data = await getQuizSet(setId);
      setQuizSet(data);
      setEditName(data.name);
      setEditDescription(data.description || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quiz set");
    } finally {
      setLoading(false);
    }
  }, [setId]);

  const loadRuns = useCallback(async () => {
    try {
      const data = await getQuizSetRuns(setId);
      setRuns(data.runs);
    } catch (err) {
      console.error("Failed to load runs:", err);
    }
  }, [setId]);

  useEffect(() => {
    void loadQuizSet();
    void loadRuns();
  }, [loadQuizSet, loadRuns]);

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setSavingName(true);
    try {
      await updateQuizSet(setId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setQuizSet((prev) =>
        prev ? { ...prev, name: editName.trim(), description: editDescription.trim() || undefined } : null
      );
      setIsEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingName(false);
    }
  };

  const handleAddItem = async (config: QuizSetItemConfig) => {
    setSavingItem(true);
    try {
      if (editingItem) {
        await updateQuizSetItem(setId, editingItem.id, config);
      } else {
        await addQuizSetItem(setId, config);
      }
      await loadQuizSet();
      setShowItemForm(false);
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Remove this quiz configuration?")) return;
    try {
      await deleteQuizSetItem(setId, itemId);
      await loadQuizSet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const handleReorderItems = async (newOrder: string[]) => {
    try {
      await reorderQuizSetItems(setId, newOrder);
      await loadQuizSet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder items");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateQuizSet(setId);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSchedule = async (cronExpression: string, timezone: string) => {
    try {
      const result = await setQuizSetSchedule(setId, { cronExpression, timezone, isEnabled: true });
      setQuizSet((prev) => (prev ? { ...prev, schedule: result.schedule } : null));
      setShowScheduleBuilder(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    }
  };

  const handleDeleteSchedule = async () => {
    if (!confirm("Remove the schedule for this quiz set?")) return;
    try {
      await deleteQuizSetSchedule(setId);
      setQuizSet((prev) => (prev ? { ...prev, schedule: undefined } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete schedule");
    }
  };

  const handleToggleSchedule = async () => {
    if (!quizSet?.schedule) return;
    try {
      const result = await toggleQuizSetSchedule(setId, !quizSet.schedule.isEnabled);
      setQuizSet((prev) => (prev ? { ...prev, schedule: result.schedule } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle schedule");
    }
  };

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
          <p className="text-gray-600">Loading quiz set...</p>
        </Card>
      </div>
    );
  }

  if (!quizSet) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <p className="text-red-600 mb-4">{error || "Quiz set not found"}</p>
          <Link href="/sets">
            <Button>Back to Quiz Sets</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {isEditingName ? (
            <div className="space-y-3">
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Quiz set name"
              />
              <Input
                id="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  loading={savingName}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsEditingName(false);
                    setEditName(quizSet.name);
                    setEditDescription(quizSet.description || "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="!mb-0">{quizSet.name}</CardTitle>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-gray-400 hover:text-primary-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
              {quizSet.description && (
                <p className="text-gray-500 mt-1">{quizSet.description}</p>
              )}
            </div>
          )}
        </div>
        <Button
          onClick={handleGenerate}
          loading={generating}
          disabled={quizSet.items.length === 0}
        >
          {generating ? "Starting..." : "Generate All"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Schedule Section */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Schedule</h3>
          {quizSet.schedule && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSchedule}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  quizSet.schedule.isEnabled ? "bg-primary-500" : "bg-gray-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    quizSet.schedule.isEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
              <button
                onClick={handleDeleteSchedule}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove schedule"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {showScheduleBuilder ? (
          <ScheduleBuilder
            initialCron={quizSet.schedule?.cronExpression}
            initialTimezone={quizSet.schedule?.timezone}
            onSave={handleSaveSchedule}
            onCancel={() => setShowScheduleBuilder(false)}
          />
        ) : quizSet.schedule ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {quizSet.schedule.isEnabled ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-sm text-green-600 font-medium">Active</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                  <span className="text-sm text-gray-400">Paused</span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-600">
              Cron: <code className="bg-gray-100 px-1 rounded">{quizSet.schedule.cronExpression}</code>
              {" "}({quizSet.schedule.timezone})
            </p>
            {quizSet.schedule.nextRunAt && (
              <p className="text-sm text-gray-500">
                Next run: {formatDateTime(quizSet.schedule.nextRunAt)}
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowScheduleBuilder(true)}
            >
              Edit Schedule
            </Button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm mb-3">No schedule configured</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowScheduleBuilder(true)}
            >
              Add Schedule
            </Button>
          </div>
        )}
      </Card>

      {/* Quiz Configurations */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            Quiz Configurations ({quizSet.items.length})
          </h3>
        </div>

        {/* Items List with Drag & Drop */}
        {quizSet.items.length > 0 && (
          <div className="mb-4">
            <ItemReorderList
              items={quizSet.items}
              onReorder={handleReorderItems}
              onEdit={(item) => {
                setEditingItem(item);
                setShowItemForm(true);
              }}
              onDelete={handleDeleteItem}
              disabled={savingItem}
            />
          </div>
        )}

        {/* Add/Edit Form */}
        {showItemForm ? (
          <div className="p-4 border border-gray-200 rounded-lg bg-white">
            <h4 className="font-medium text-gray-900 mb-4">
              {editingItem ? "Edit Quiz Configuration" : "Add Quiz Configuration"}
            </h4>
            <QuizItemForm
              initialValues={editingItem || undefined}
              onSubmit={handleAddItem}
              onCancel={() => {
                setShowItemForm(false);
                setEditingItem(null);
              }}
              submitLabel={editingItem ? "Update Quiz" : "Add Quiz"}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowItemForm(true)}
            className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Quiz Configuration
          </button>
        )}
      </Card>

      {/* Recent Runs */}
      {runs.length > 0 && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Recent Runs</h3>
          <div className="space-y-2">
            {runs.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        run.status === "completed" ? "bg-green-500" :
                          run.status === "running" ? "bg-amber-500 animate-pulse" :
                            run.status === "partial" ? "bg-amber-500" : "bg-red-500"
                      )}
                    />
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {run.status}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">
                      {run.triggerType === "scheduled" ? "Scheduled" : "Manual"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(run.startedAt)} · {run.completedItems}/{run.totalItems} completed
                    {run.failedItems > 0 && ` · ${run.failedItems} failed`}
                  </div>
                </div>
                <Link href={`/sets/${setId}/runs/${run.id}`}>
                  <Button variant="secondary" size="sm">
                    View
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Back Link */}
      <div className="pt-4">
        <Link href="/sets" className="text-primary-500 hover:text-primary-600 text-sm">
          &larr; Back to Quiz Sets
        </Link>
      </div>
    </div>
  );
}

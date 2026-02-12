"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CheckboxGroup, Input } from "@/components/ui";
import {
  createQuizSetNotifierApi,
  deleteQuizSetNotifierApi,
  getQuizSetNotifiers,
  updateQuizSetNotifierApi,
} from "@/lib/api";
import type {
  QuizSetNotifier,
  QuizSetNotifierEventType,
} from "@mcqs/shared";

const EVENT_OPTIONS: Array<{
  value: QuizSetNotifierEventType;
  label: string;
  description: string;
}> = [
  {
    value: "quiz_set.modified",
    label: "Set Modified",
    description: "Notify when quiz set metadata/items/schedule are changed.",
  },
  {
    value: "quiz_set.generation.started",
    label: "Run Started",
    description: "Notify when manual or scheduled generation starts.",
  },
  {
    value: "quiz_set.generation.completed",
    label: "Run Completed",
    description: "Notify when all run items succeed.",
  },
  {
    value: "quiz_set.generation.partial",
    label: "Run Partial",
    description: "Notify when some run items fail.",
  },
  {
    value: "quiz_set.generation.failed",
    label: "Run Failed",
    description: "Notify when all run items fail.",
  },
  {
    value: "quiz_set.generation.item_failed",
    label: "Item Failed",
    description: "Notify when any single run item fails.",
  },
];

const ALL_EVENTS = EVENT_OPTIONS.map((option) => option.value);

interface NotifierManagerProps {
  setId: string;
}

export function NotifierManager({ setId }: NotifierManagerProps) {
  const [notifiers, setNotifiers] = useState<QuizSetNotifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newTargetUrl, setNewTargetUrl] = useState("");
  const [newEvents, setNewEvents] = useState<QuizSetNotifierEventType[]>(ALL_EVENTS);

  const [editLabel, setEditLabel] = useState("");
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editEvents, setEditEvents] = useState<QuizSetNotifierEventType[]>(ALL_EVENTS);
  const [editEnabled, setEditEnabled] = useState(true);

  const loadNotifiers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getQuizSetNotifiers(setId);
      setNotifiers(result.notifiers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifiers");
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    void loadNotifiers();
  }, [loadNotifiers]);

  const sortedNotifiers = useMemo(() => {
    return [...notifiers].sort((a, b) => b.createdAt - a.createdAt);
  }, [notifiers]);

  const resetCreateForm = () => {
    setNewLabel("");
    setNewTargetUrl("");
    setNewEvents(ALL_EVENTS);
  };

  const startEdit = (notifier: QuizSetNotifier) => {
    setEditingId(notifier.id);
    setEditLabel(notifier.label || "");
    setEditTargetUrl("");
    setEditEvents(notifier.events);
    setEditEnabled(notifier.isEnabled);
  };

  const handleCreate = async () => {
    if (!newTargetUrl.trim()) {
      setError("Webhook URL is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createQuizSetNotifierApi(setId, {
        provider: "discord_webhook",
        label: newLabel.trim() || undefined,
        targetUrl: newTargetUrl.trim(),
        isEnabled: true,
        events: newEvents,
      });
      resetCreateForm();
      await loadNotifiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create notifier");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleEnabled = async (notifier: QuizSetNotifier) => {
    setSavingId(notifier.id);
    setError(null);
    try {
      await updateQuizSetNotifierApi(setId, notifier.id, {
        isEnabled: !notifier.isEnabled,
      });
      await loadNotifiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update notifier");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveEdit = async (notifierId: string) => {
    setSavingId(notifierId);
    setError(null);
    try {
      await updateQuizSetNotifierApi(setId, notifierId, {
        label: editLabel.trim() || undefined,
        targetUrl: editTargetUrl.trim() || undefined,
        events: editEvents,
        isEnabled: editEnabled,
      });
      setEditingId(null);
      await loadNotifiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update notifier");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (notifierId: string) => {
    if (!confirm("Delete this notifier?")) return;
    setDeletingId(notifierId);
    setError(null);
    try {
      await deleteQuizSetNotifierApi(setId, notifierId);
      if (editingId === notifierId) setEditingId(null);
      await loadNotifiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete notifier");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Notifications</h3>
          <span className="text-xs text-gray-500">
            Multiple Discord webhooks supported
          </span>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Loading notifiers...</div>
        ) : (
          <div className="space-y-3">
            {sortedNotifiers.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
                No notifiers configured yet.
              </div>
            ) : (
              sortedNotifiers.map((notifier) => (
                <div
                  key={notifier.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {notifier.label || "Discord Webhook"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {notifier.targetUrlMasked}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleEnabled(notifier)}
                        loading={savingId === notifier.id}
                      >
                        {notifier.isEnabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          editingId === notifier.id ? setEditingId(null) : startEdit(notifier)
                        }
                      >
                        {editingId === notifier.id ? "Close" : "Edit"}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(notifier.id)}
                        loading={deletingId === notifier.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {notifier.events.map((eventType) => (
                      <span
                        key={eventType}
                        className="rounded bg-white px-2 py-1 text-[11px] text-gray-700 border border-gray-200"
                      >
                        {eventType}
                      </span>
                    ))}
                  </div>

                  {editingId === notifier.id && (
                    <div className="mt-3 space-y-3 rounded-md border border-gray-200 bg-white p-3">
                      <Input
                        id={`notifier-label-${notifier.id}`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Label (optional)"
                      />
                      <Input
                        id={`notifier-url-${notifier.id}`}
                        value={editTargetUrl}
                        onChange={(e) => setEditTargetUrl(e.target.value)}
                        placeholder="Paste new webhook URL only if rotating"
                      />
                      <CheckboxGroup
                        name={`events-${notifier.id}`}
                        label="Events"
                        options={EVENT_OPTIONS}
                        value={editEvents}
                        onChange={(value) => setEditEvents(value as QuizSetNotifierEventType[])}
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={editEnabled}
                          onChange={(e) => setEditEnabled(e.target.checked)}
                        />
                        Enabled
                      </label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(notifier.id)}
                          loading={savingId === notifier.id}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Add Discord Webhook</h4>
          <Input
            id="new-notifier-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
          />
          <Input
            id="new-notifier-url"
            value={newTargetUrl}
            onChange={(e) => setNewTargetUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <CheckboxGroup
            name="new-notifier-events"
            label="Events"
            options={EVENT_OPTIONS}
            value={newEvents}
            onChange={(value) => setNewEvents(value as QuizSetNotifierEventType[])}
          />
          <div className="flex gap-2">
            <Button onClick={handleCreate} loading={creating}>
              Add Notifier
            </Button>
            <Button variant="secondary" onClick={resetCreateForm}>
              Reset
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

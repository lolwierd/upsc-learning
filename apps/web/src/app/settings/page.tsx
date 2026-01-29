"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription, Button } from "@/components/ui";
import { getQuizSets, getSettings, updateSettings } from "@/lib/api";
import { MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from "@mcqs/shared";
import type { QuizSetListItem } from "@mcqs/shared";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [defaultQuestionCount, setDefaultQuestionCount] = useState(10);
  const [learnModeEnabled, setLearnModeEnabled] = useState(false);
  const [defaultQuizSetId, setDefaultQuizSetId] = useState<string | null>(null);
  const [quizSets, setQuizSets] = useState<QuizSetListItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsResult, setsResult] = await Promise.allSettled([
          getSettings(),
          getQuizSets(),
        ]);
        if (settingsResult.status === "fulfilled") {
          setDefaultQuestionCount(settingsResult.value.defaultQuestionCount);
          setLearnModeEnabled(settingsResult.value.learnModeEnabled);
          setDefaultQuizSetId(settingsResult.value.defaultQuizSetId ?? null);
        } else {
          setError(
            settingsResult.reason instanceof Error
              ? settingsResult.reason.message
              : "Failed to load settings"
          );
        }
        if (setsResult.status === "fulfilled") {
          setQuizSets(setsResult.value.sets);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateSettings({
        defaultQuestionCount,
        learnModeEnabled,
        defaultQuizSetId,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <CardTitle className="mb-2">Settings</CardTitle>
      <CardDescription className="mb-6">
        Manage your quiz preferences
      </CardDescription>

      <div className="space-y-4">
        {/* Default Question Count */}
        <Card>
          <CardTitle className="text-base">Default Question Count</CardTitle>
          <CardDescription>
            Pre-select this number when creating new quizzes
          </CardDescription>
          <div className="mt-4">
            <input
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              value={defaultQuestionCount}
              onChange={(e) => setDefaultQuestionCount(parseInt(e.target.value) || 10)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a number between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}
            </p>
          </div>
        </Card>

        {/* Default Quiz Set */}
        <Card>
          <CardTitle className="text-base">Default Quiz Set</CardTitle>
          <CardDescription>
            Jump to the latest combined run when opening the dashboard
          </CardDescription>
          <div className="mt-4">
            <select
              value={defaultQuizSetId ?? ""}
              onChange={(e) => setDefaultQuizSetId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">None (show dashboard)</option>
              {defaultQuizSetId &&
                !quizSets.some((set) => set.id === defaultQuizSetId) && (
                  <option value={defaultQuizSetId}>Unknown set (missing)</option>
                )}
              {quizSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              If no completed run exists yet, you will stay on the dashboard.
            </p>
          </div>
        </Card>

        {/* Learn Mode */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Learn Mode</CardTitle>
              <CardDescription>
                Show correct answers and explanations instantly after selecting an option. No attempt tracking.
              </CardDescription>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={learnModeEnabled}
              onClick={() => setLearnModeEnabled(!learnModeEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                learnModeEnabled ? "bg-primary-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  learnModeEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </Card>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Settings saved successfully!
          </div>
        )}

        {/* Save Button */}
        <Button onClick={handleSave} loading={saving} className="w-full">
          Save Settings
        </Button>
      </div>
    </div>
  );
}

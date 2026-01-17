"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription, Button, Input, RadioGroup } from "@/components/ui";
import { getSettings, updateSettings, resetApiKey } from "@/lib/api";
import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_LABELS,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
} from "@mcqs/shared";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [defaultModel, setDefaultModel] = useState<string>("gemini");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [defaultQuestionCount, setDefaultQuestionCount] = useState(10);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const settings = await getSettings();
        setDefaultModel(settings.defaultModel);
        setDefaultQuestionCount(settings.defaultQuestionCount);
        setHasOpenaiKey(settings.hasOpenaiKey);
        setHasGeminiKey(settings.hasGeminiKey);
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
        defaultModel: defaultModel as "gemini" | "openai",
        openaiApiKey: openaiKey || undefined,
        geminiApiKey: geminiKey || undefined,
        defaultQuestionCount,
      });
      setSuccess(true);
      if (openaiKey) setHasOpenaiKey(true);
      if (geminiKey) setHasGeminiKey(true);
      setOpenaiKey("");
      setGeminiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleResetKey = async (keyType: "openai" | "gemini") => {
    setResetting(keyType);
    setError(null);
    setSuccess(false);

    try {
      await resetApiKey(keyType);
      if (keyType === "openai") {
        setHasOpenaiKey(false);
        setOpenaiKey("");
      } else {
        setHasGeminiKey(false);
        setGeminiKey("");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset key");
    } finally {
      setResetting(null);
    }
  };

  const modelOptions = MODEL_PROVIDERS.map((m) => ({
    value: m,
    label: MODEL_PROVIDER_LABELS[m],
    description:
      m === "gemini"
        ? "Uses Gemini 3 Flash - default model (uses server key if not set)"
        : "Uses GPT-4 - requires your API key",
  }));

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
      <CardTitle className="mb-6">Settings</CardTitle>

      <div className="space-y-6">
        {/* Model Selection */}
        <Card>
          <CardTitle className="text-base">AI Model</CardTitle>
          <CardDescription>
            Choose the AI model for generating questions
          </CardDescription>
          <div className="mt-4">
            <RadioGroup
              name="model"
              options={modelOptions}
              value={defaultModel}
              onChange={setDefaultModel}
            />
          </div>
        </Card>

        {/* API Keys */}
        <Card>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>
            Add your own API keys for premium models. Gemini uses the server default if not set.
          </CardDescription>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    id="gemini-key"
                    label="Google Gemini API Key"
                    type="password"
                    placeholder={hasGeminiKey ? "••••••••••••••••" : "AI..."}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    helperText={
                      hasGeminiKey
                        ? "Your custom key is saved. Reset to use server default."
                        : "Optional - leave empty to use server default"
                    }
                  />
                </div>
                {hasGeminiKey && (
                  <Button
                    variant="secondary"
                    onClick={() => handleResetKey("gemini")}
                    loading={resetting === "gemini"}
                    className="mb-5"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    id="openai-key"
                    label="OpenAI API Key"
                    type="password"
                    placeholder={hasOpenaiKey ? "••••••••••••••••" : "sk-..."}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    helperText={
                      hasOpenaiKey
                        ? "Key already saved. Enter a new key to replace it."
                        : "Required to use GPT-4 model"
                    }
                  />
                </div>
                {hasOpenaiKey && (
                  <Button
                    variant="secondary"
                    onClick={() => handleResetKey("openai")}
                    loading={resetting === "openai"}
                    className="mb-5"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

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

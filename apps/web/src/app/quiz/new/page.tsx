"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Select,
  Input,
} from "@/components/ui";
import {
  SUBJECTS,
  SUBJECT_LABELS,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
} from "@mcqs/shared";
import { generateQuiz, getSettings } from "@/lib/api";
import { ControlledProgress } from "@/components/GenerationProgress";
import { cn } from "@/lib/utils";

const QUESTION_PRESETS = [40, 80, 120, 160];

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "complete";
}

const INITIAL_STEPS: ProgressStep[] = [
  { label: "Warming up the AI engine...", status: "pending" },
  { label: "Loading IFS 2026...", status: "pending" },
  { label: "Analyzing subject matter...", status: "pending" },
  { label: "Crafting quiz parameters...", status: "pending" },
  { label: "Building prompt for Gemini...", status: "pending" },
  { label: "Generating questions...", status: "pending" },
  { label: "Parsing AI response...", status: "pending" },
  { label: "Validating question format...", status: "pending" },
  { label: "Shuffling answer options...", status: "pending" },
  { label: "Writing to database...", status: "pending" },
  { label: "Finalizing quiz...", status: "pending" },
  { label: "Ready to test your knowledge!", status: "pending" },
];

export default function NewQuizPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(INITIAL_STEPS);

  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [theme, setTheme] = useState("");
  // Styles are now auto-distributed based on UPSC pattern - no user selection needed

  const [questionCount, setQuestionCount] = useState<number>(40);
  // Current affairs theme (current affairs is now always enabled)
  const [currentAffairsTheme, setCurrentAffairsTheme] = useState<string>("");

  // Load default question count from settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getSettings();
        if (settings.defaultQuestionCount) {
          setQuestionCount(settings.defaultQuestionCount);
        }
      } catch {
        // Silently fail, use default
      }
    }
    loadSettings();
  }, []);

  // Helper to update step status
  const updateStep = (index: number, status: ProgressStep["status"]) => {
    setProgressSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, status } : step))
    );
  };

  // Simulate progress through steps with timing
  const runProgressStep = async (index: number, duration: number): Promise<void> => {
    updateStep(index, "active");
    await new Promise((resolve) => setTimeout(resolve, duration));
    updateStep(index, "complete");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setProgressSteps(INITIAL_STEPS);

    // Validate question count
    if (questionCount < MIN_QUESTION_COUNT || questionCount > MAX_QUESTION_COUNT) {
      setError(`Question count must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}`);
      setLoading(false);
      return;
    }

    // Styles are auto-distributed on the backend

    try {
      // Step 0: Warming up
      await runProgressStep(0, 300);

      // Step 1: Loading IFS 2026
      await runProgressStep(1, 400);

      // Step 2: Analyzing subject
      await runProgressStep(2, 350);

      // Step 3: Crafting quiz parameters
      await runProgressStep(3, 300);

      // Step 4: Building prompt
      await runProgressStep(4, 400);

      // Step 5: Generating questions (actual API call)
      updateStep(5, "active");

      const result = await generateQuiz({
        subject: subject as (typeof SUBJECTS)[number],
        theme: theme || undefined,
        styles: [], // Empty array = auto-distribute based on UPSC pattern
        questionCount,

        enableCurrentAffairs: true, // Always enabled
        currentAffairsTheme: currentAffairsTheme || undefined,
      });

      // API returned successfully (async started)
      updateStep(5, "complete");
      router.push(`/quiz/${result.quizId}`);
      return; // Stop execution here as we are redirecting
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
      setProgressSteps(INITIAL_STEPS);
    } finally {
      setLoading(false);
    }
  };

  const subjectOptions = SUBJECTS.map((s) => ({
    value: s,
    label: s === 'random' ? `🎲 ${SUBJECT_LABELS[s]}` : SUBJECT_LABELS[s],
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card>
        <CardTitle>Create New Quiz</CardTitle>
        <CardDescription>
          Configure your quiz settings and generate UPSC-style MCQs
        </CardDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Subject */}
          <Select
            id="subject"
            label="Subject"
            options={subjectOptions}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          {/* Theme */}
          <div className="space-y-1">
            <Input
              id="theme"
              label="Theme (Optional)"
              placeholder="e.g., Mughal Empire, Climate Change, Constitutional Amendments"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              helperText={subject === 'random' ? undefined : "Preferred focus only; questions also cover adjacent subtopics"}
            />
            {subject === 'random' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                💡 In Random Mode, theme acts as a focus across multiple subjects
                (e.g., Climate Change 2025 covers environment, geography, polity, economy aspects)
              </p>
            )}
          </div>

          {/* Question Style Distribution (Auto) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                📊 Question Style Distribution
              </span>
              <span className="text-xs text-white bg-blue-500 px-2 py-0.5 rounded-full">
                UPSC Pattern
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span>Statement Questions</span><span className="font-medium">~56%</span></div>
              <div className="flex justify-between"><span>Match-the-Following</span><span className="font-medium">~20%</span></div>
              <div className="flex justify-between"><span>Assertion-Reason</span><span className="font-medium">~14%</span></div>
              <div className="flex justify-between"><span>Standard/Factual</span><span className="font-medium">~10%</span></div>
            </div>
            <p className="text-xs text-gray-500">
              Based on UPSC Prelims 2024-2025 analysis. Automatically applied for realistic practice.
            </p>
          </div>



          {/* Current Affairs Theme (always enabled, optional focus) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                🌐 Current Affairs Integration
              </span>
              <span className="text-xs text-white bg-green-500 px-2 py-0.5 rounded-full">
                Always On
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Uses web search to integrate recent events as question triggers. 20% of questions
              will be AI predictions for UPSC 2026 based on emerging topics.
            </p>
            <Input
              id="currentAffairsTheme"
              label="Current Affairs Focus (Optional)"
              placeholder="e.g., G20 Summit, Budget 2024, Climate Agreements"
              value={currentAffairsTheme}
              onChange={(e) => setCurrentAffairsTheme(e.target.value)}
              helperText="Optionally specify a current affairs topic to prioritize"
            />
            {subject === 'random' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                💡 Random Mode emphasizes recent developments (2025-2026).
                This helps AI prioritize specific current affairs topics.
              </p>
            )}
          </div>

          {/* Question Count */}
          <div>
            <label
              htmlFor="questionCount"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Number of Questions
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Preset buttons */}
              {QUESTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuestionCount(preset)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    questionCount === preset
                      ? "bg-primary-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  {preset}
                </button>
              ))}
              {/* Custom input */}
              <input
                type="number"
                id="questionCount"
                min={MIN_QUESTION_COUNT}
                max={MAX_QUESTION_COUNT}
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value) || 40)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Select a preset or enter custom ({MIN_QUESTION_COUNT}-{MAX_QUESTION_COUNT})
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Generation Progress */}
          {loading && (
            <ControlledProgress
              steps={progressSteps.filter((s) => s.status !== "pending")}
              title={`quiz-generator — ${questionCount} questions • ${SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS]}`}
            />
          )}

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              {loading ? "Generating..." : "Generate Quiz"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

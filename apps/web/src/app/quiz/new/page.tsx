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
  RadioGroup,
  CheckboxGroup,
} from "@/components/ui";
import {
  SUBJECTS,
  SUBJECT_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_DESCRIPTIONS,
  QUESTION_STYLES,
  QUESTION_STYLE_LABELS,
  QUESTION_STYLE_DESCRIPTIONS,
  QUESTION_ERAS,
  QUESTION_ERA_LABELS,
  QUESTION_ERA_DESCRIPTIONS,
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
  { label: "Crafting difficulty parameters...", status: "pending" },
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
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[1]);
  const [styles, setStyles] = useState<string[]>([...QUESTION_STYLES]);
  const [era, setEra] = useState<string>(QUESTION_ERAS[0]); // "current" by default
  const [questionCount, setQuestionCount] = useState<number>(40);

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

    if (styles.length === 0) {
      setError("Select at least one question style");
      setLoading(false);
      return;
    }

    try {
      // Step 0: Warming up
      await runProgressStep(0, 300);

      // Step 1: Loading IFS 2026
      await runProgressStep(1, 400);

      // Step 2: Analyzing subject
      await runProgressStep(2, 350);

      // Step 3: Crafting difficulty
      await runProgressStep(3, 300);

      // Step 4: Building prompt
      await runProgressStep(4, 400);

      // Step 5: Generating questions (actual API call)
      updateStep(5, "active");

      const result = await generateQuiz({
        subject: subject as (typeof SUBJECTS)[number],
        theme: theme || undefined,
        difficulty: difficulty as (typeof DIFFICULTIES)[number],
        styles: styles as (typeof QUESTION_STYLES)[number][],
        questionCount,
        era: era as (typeof QUESTION_ERAS)[number],
      });

      updateStep(5, "complete");

      // Step 6: Parsing response
      await runProgressStep(6, 350);

      // Step 7: Validating format
      await runProgressStep(7, 350);

      // Step 8: Shuffling options
      await runProgressStep(8, 250);

      // Step 9: Writing to database
      await runProgressStep(9, 300);

      // Step 10: Finalizing
      await runProgressStep(10, 200);

      // Step 11: Ready!
      updateStep(11, "complete");

      // Brief pause to show completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      router.push(`/quiz/${result.quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
      setProgressSteps(INITIAL_STEPS);
    } finally {
      setLoading(false);
    }
  };

  const subjectOptions = SUBJECTS.map((s) => ({
    value: s,
    label: SUBJECT_LABELS[s],
  }));

  const difficultyOptions = DIFFICULTIES.map((d) => ({
    value: d,
    label: DIFFICULTY_LABELS[d],
    description: DIFFICULTY_DESCRIPTIONS[d],
  }));

  const styleOptions = QUESTION_STYLES.map((s) => ({
    value: s,
    label: QUESTION_STYLE_LABELS[s],
    description: QUESTION_STYLE_DESCRIPTIONS[s],
  }));

  const eraOptions = QUESTION_ERAS.map((e) => ({
    value: e,
    label: QUESTION_ERA_LABELS[e],
    description: QUESTION_ERA_DESCRIPTIONS[e],
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
          <Input
            id="theme"
            label="Theme (Optional)"
            placeholder="e.g., Mughal Empire, Climate Change, Constitutional Amendments"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            helperText="Specify a topic to focus the questions"
          />

          {/* Difficulty */}
          <RadioGroup
            name="difficulty"
            label="Difficulty"
            options={difficultyOptions}
            value={difficulty}
            onChange={setDifficulty}
          />

          {/* Question Styles */}
          <CheckboxGroup
            name="styles"
            label="Question Styles"
            options={styleOptions}
            value={styles}
            onChange={setStyles}
          />

          {/* Era Selection */}
          <RadioGroup
            name="era"
            label="Question Era (UPSC PYQ Style)"
            options={eraOptions}
            value={era}
            onChange={setEra}
          />

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

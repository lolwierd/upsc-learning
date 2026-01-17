"use client";

import { useState } from "react";
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
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
} from "@mcqs/shared";
import { generateQuiz } from "@/lib/api";

export default function NewQuizPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [theme, setTheme] = useState("");
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[1]);
  const [styles, setStyles] = useState<string[]>([...QUESTION_STYLES]);
  const [questionCount, setQuestionCount] = useState<number>(10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
      const result = await generateQuiz({
        subject: subject as (typeof SUBJECTS)[number],
        theme: theme || undefined,
        difficulty: difficulty as (typeof DIFFICULTIES)[number],
        styles: styles as (typeof QUESTION_STYLES)[number][],
        questionCount,
      });

      router.push(`/quiz/${result.quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
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

          {/* Question Count */}
          <div>
            <label
              htmlFor="questionCount"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Number of Questions
            </label>
            <input
              type="number"
              id="questionCount"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value) || 10)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a number between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              {loading ? "Generating Quiz..." : "Generate Quiz"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

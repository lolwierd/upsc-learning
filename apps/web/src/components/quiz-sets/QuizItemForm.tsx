"use client";

import { useState } from "react";
import {
  Select,
  Input,
  RadioGroup,
  Button,
} from "@/components/ui";
import {
  SUBJECTS,
  SUBJECT_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_DESCRIPTIONS,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
} from "@mcqs/shared";
import type { QuizSetItemConfig } from "@mcqs/shared";
import { cn } from "@/lib/utils";

const QUESTION_PRESETS = [10, 20, 40, 80];

interface QuizItemFormProps {
  initialValues?: Partial<QuizSetItemConfig>;
  onSubmit: (values: QuizSetItemConfig) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export function QuizItemForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Add Quiz",
}: QuizItemFormProps) {
  const [subject, setSubject] = useState<string>(
    initialValues?.subject || SUBJECTS[0]
  );
  const [theme, setTheme] = useState(initialValues?.theme || "");
  const [difficulty, setDifficulty] = useState<string>(
    initialValues?.difficulty || DIFFICULTIES[1]
  );
  // Styles are auto-distributed based on UPSC pattern - no user selection needed

  const [questionCount, setQuestionCount] = useState<number>(
    initialValues?.questionCount || 40
  );
  // Current affairs is always enabled, only theme is configurable
  const [currentAffairsTheme, setCurrentAffairsTheme] = useState<string>(
    initialValues?.currentAffairsTheme || ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    setError(null);

    // Styles are auto-distributed on backend

    if (questionCount < MIN_QUESTION_COUNT || questionCount > MAX_QUESTION_COUNT) {
      setError(`Question count must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}`);
      return;
    }

    onSubmit({
      subject: subject as (typeof SUBJECTS)[number],
      theme: theme || undefined,
      difficulty: difficulty as (typeof DIFFICULTIES)[number],
      styles: [], // Empty = auto-distribute based on UPSC pattern
      questionCount,

      enableCurrentAffairs: true, // Always enabled
      currentAffairsTheme: currentAffairsTheme || undefined,
    });
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



  return (
    <div className="space-y-5">
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
        placeholder="e.g., Mughal Empire, Climate Change"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        helperText="Preferred focus only; questions also cover adjacent subtopics"
      />

      {/* Difficulty */}
      <RadioGroup
        name="difficulty"
        label="Difficulty"
        options={difficultyOptions}
        value={difficulty}
        onChange={setDifficulty}
      />

      {/* Question Style Distribution (Auto) */}
      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-gray-700">📊 Style Distribution</span>
          <span className="text-[10px] text-white bg-blue-500 px-1.5 py-0.5 rounded">UPSC Pattern</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <span>Statement ~56%</span>
          <span>Match ~20%</span>
          <span>Assertion ~14%</span>
          <span>Factual ~10%</span>
        </div>
      </div>



      {/* Current Affairs (Always On) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            🌐 Current Affairs
          </span>
          <span className="text-xs text-white bg-green-500 px-2 py-0.5 rounded-full">
            Always On
          </span>
        </div>
        <Input
          id="currentAffairsTheme"
          label="Current Affairs Focus (Optional)"
          placeholder="e.g., G20 Summit, Budget 2024"
          value={currentAffairsTheme}
          onChange={(e) => setCurrentAffairsTheme(e.target.value)}
          helperText="Optionally focus on specific current affairs topics"
        />
      </div>

      {/* Question Count */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Questions
        </label>
        <div className="flex items-center gap-2 flex-wrap">
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
          <input
            type="number"
            min={MIN_QUESTION_COUNT}
            max={MAX_QUESTION_COUNT}
            value={questionCount}
            onChange={(e) => setQuestionCount(parseInt(e.target.value) || 40)}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

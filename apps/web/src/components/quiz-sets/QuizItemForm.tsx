"use client";

import { useState } from "react";
import {
  Select,
  Input,
  RadioGroup,
  CheckboxGroup,
  Button,
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
  const [styles, setStyles] = useState<string[]>(
    initialValues?.styles || [...QUESTION_STYLES]
  );
  const [era, setEra] = useState<string>(initialValues?.era || QUESTION_ERAS[0]);
  const [questionCount, setQuestionCount] = useState<number>(
    initialValues?.questionCount || 40
  );
  const [enableCurrentAffairs, setEnableCurrentAffairs] = useState<boolean>(
    initialValues?.enableCurrentAffairs || false
  );
  const [currentAffairsTheme, setCurrentAffairsTheme] = useState<string>(
    initialValues?.currentAffairsTheme || ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    setError(null);

    if (styles.length === 0) {
      setError("Select at least one question style");
      return;
    }

    if (questionCount < MIN_QUESTION_COUNT || questionCount > MAX_QUESTION_COUNT) {
      setError(`Question count must be between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}`);
      return;
    }

    onSubmit({
      subject: subject as (typeof SUBJECTS)[number],
      theme: theme || undefined,
      difficulty: difficulty as (typeof DIFFICULTIES)[number],
      styles: styles as (typeof QUESTION_STYLES)[number][],
      questionCount,
      era: era as (typeof QUESTION_ERAS)[number],
      enableCurrentAffairs,
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
        label="Question Era"
        options={eraOptions}
        value={era}
        onChange={setEra}
      />

      {/* Current Affairs */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label htmlFor="enableCurrentAffairs" className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="enableCurrentAffairs"
              checked={enableCurrentAffairs}
              onChange={(e) => setEnableCurrentAffairs(e.target.checked)}
              className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-700">
              Include Current Affairs
            </span>
          </label>
        </div>
        {enableCurrentAffairs && (
          <Input
            id="currentAffairsTheme"
            label="Current Affairs Focus (Optional)"
            placeholder="e.g., G20 Summit, Budget 2024"
            value={currentAffairsTheme}
            onChange={(e) => setCurrentAffairsTheme(e.target.value)}
          />
        )}
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

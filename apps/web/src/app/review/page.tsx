"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getWrongAnswers } from "@/lib/api";
import type { WrongAnswer } from "@mcqs/shared";
import { SUBJECTS, SUBJECT_LABELS } from "@mcqs/shared";

export default function ReviewPage() {
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getWrongAnswers(subject || undefined);
        setWrongAnswers(data.wrongAnswers);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load wrong answers");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subject]);

  const subjectOptions = [
    { value: "", label: "All Subjects" },
    ...SUBJECTS.map((s) => ({ value: s, label: SUBJECT_LABELS[s] })),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Wrong Answers</h1>
          <p className="text-gray-500 mt-1">
            Study the questions you got wrong across all quizzes
          </p>
        </div>
        <div className="w-48">
          <Select
            options={subjectOptions}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Card className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading wrong answers...</p>
        </Card>
      ) : error ? (
        <Card className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </Card>
      ) : wrongAnswers.length === 0 ? (
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🎉</div>
          <p className="text-gray-600 mb-4">
            {subject
              ? "No wrong answers in this subject. Great job!"
              : "No wrong answers yet. Keep up the good work!"}
          </p>
          <Link href="/quiz/new">
            <Button>Take a Quiz</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {wrongAnswers.length} question{wrongAnswers.length !== 1 ? "s" : ""} to review
          </p>

          {wrongAnswers.map((answer, index) => {
            const selectedOption = answer.selectedOption;
            const correctOption = answer.correctOption;

            return (
              <Card key={index} className="border-l-4 border-l-red-500">
                {/* Subject & Theme badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded">
                    {SUBJECT_LABELS[answer.subject as keyof typeof SUBJECT_LABELS]}
                  </span>
                  {answer.theme && (
                    <span className="text-xs text-gray-500">{answer.theme}</span>
                  )}
                </div>

                {/* Question */}
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-red-100 text-red-700 rounded-lg flex items-center justify-center font-medium text-sm">
                    {index + 1}
                  </span>
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {answer.questionText}
                  </p>
                </div>

                {/* Options */}
                <div className="space-y-2 ml-11">
                  {answer.options.map((option, optIndex) => {
                    const isSelected = selectedOption === optIndex;
                    const isCorrectOption = correctOption === optIndex;
                    const optionLabel = String.fromCharCode(65 + optIndex);

                    let bgColor = "bg-white border-gray-200";
                    let textColor = "text-gray-700";

                    if (isCorrectOption) {
                      bgColor = "bg-green-50 border-green-300";
                      textColor = "text-green-700";
                    } else if (isSelected) {
                      bgColor = "bg-red-50 border-red-300";
                      textColor = "text-red-700";
                    }

                    return (
                      <div
                        key={optIndex}
                        className={cn(
                          "p-3 rounded-lg border flex items-start gap-3",
                          bgColor
                        )}
                      >
                        <span
                          className={cn(
                            "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                            isCorrectOption
                              ? "border-green-500 bg-green-500 text-white"
                              : isSelected
                              ? "border-red-500 bg-red-500 text-white"
                              : "border-gray-300 text-gray-500"
                          )}
                        >
                          {isCorrectOption ? "✓" : isSelected ? "✗" : optionLabel}
                        </span>
                        <span className={cn("text-sm", textColor)}>{option}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="mt-4 ml-11 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Explanation
                  </p>
                  <p className="text-sm text-blue-700">{answer.explanation}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
